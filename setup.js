// Download only at setup time. No third-party code is stored in Git.
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import dependencies from './dependencies.json' with { type: 'json' };

const directory = new URL(`./.cache/mermaid-${dependencies.version}/`, import.meta.url);
const hash = data => createHash('sha256').update(data).digest('hex');
await mkdir(new URL('licenses/', directory), { recursive: true });

async function obtain(name, source, expected) {
  const target = new URL(name, directory);
  try {
    const cached = await readFile(target);
    if (hash(cached) === expected) return cached;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const response = await fetch(`https://cdn.jsdelivr.net/npm/${source}`, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`${source}: HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (hash(data) !== expected) throw new Error(`取得ファイルのSHA-256が一致しません: ${source}`);
  const temp = new URL(`${name}.tmp`, directory);
  await writeFile(temp, data);
  await rename(temp, target);
  return data;
}

try {
  await obtain('mermaid.min.js', `mermaid@${dependencies.version}/dist/mermaid.min.js`, dependencies.sha256);
  let notices = `Mermaid ${dependencies.version} and bundled dependencies\n`;
  notices += 'Unmodified official full IIFE. License sources pinned from its source map.\n';
  notices += 'ELK source (EPL-2.0): https://github.com/kieler/elkjs/tree/v0.9.3\nhttps://github.com/eclipse/elk\n';
  for (const [source, expected] of Object.entries(dependencies.licenses)) {
    const data = await obtain(`licenses/${expected}.txt`, source, expected);
    notices += `\n--- ${source} ---\n${data.toString('utf8')}\n`;
  }
  await writeFile(new URL('licenses.txt.tmp', directory), notices);
  await rename(new URL('licenses.txt.tmp', directory), new URL('licenses.txt', directory));
  console.log(`Mermaid ${dependencies.version}: ready (${fileURLToPath(directory)})`);
  console.log('リポジトリの bin をPATHへ追加し、mdh --doctor でNode/Pandocを確認してください。');
} catch (error) {
  console.error(`setup: ${error.message}\nネットワークを確認して node setup.js を再実行してください。`);
  process.exitCode = 1;
}
