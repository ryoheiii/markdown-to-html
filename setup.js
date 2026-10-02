// Download Mermaid only during setup; remote document resources are handled by Pandoc.
import { readFile, writeFile, mkdir, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dependencies, checkNode, resource } from './src/environment.js';
import { isMainModule } from './src/entry-point.js';
import { sha256, mermaidAsset } from './src/assets.js';
import { run } from './src/pandoc.js';
import { managePath, prepareCommand, pathInstructions } from './src/path-setup.js';
import path from 'node:path';

const help = `使い方: node setup.js [オプション]
  引数なし: Mermaid の取得と検証、mdh コマンドの準備（PATH は変更しません）。
  --add-path: mdh を登録（Windows: ユーザー PATH、Ubuntu: ~/.local/bin のリンク）。
  --remove-path: このプロジェクトの mdh 登録を解除（通信なし）。
  --install-node / --remove-node: Ubuntu の Node.js ユーザー導入 / 削除。
  --install-pandoc / --remove-pandoc: Ubuntu の Pandoc ユーザー導入 / 削除。
  Ubuntu: bash setup.sh でも同じオプションを使用できます（Node.js 不要）。
  --help: このヘルプを表示。
既存の対応版はそのまま使用します。Windows の Node.js / Pandoc は公式インストーラーで管理してください。`;

export function parseSetupArguments(args) {
  if (!args.length) return {};
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return { help: true };
  if (args.length === 1 && ['--install-node', '--remove-node', '--install-pandoc', '--remove-pandoc'].includes(args[0])) return { ubuntuAction: args[0] };
  if (args.length !== 1 || !['--add-path', '--remove-path'].includes(args[0])) throw new Error(help);
  return { action: args[0] === '--add-path' ? 'add' : 'remove' };
}

export async function downloadAsset(url) {
  return fetch(url, { signal: AbortSignal.timeout(60000) });
}

async function obtain(target, url, expected, download) {
  try { if (sha256(await readFile(target)) === expected) return target; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const response = await download(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (sha256(data) !== expected) throw new Error('取得ファイルの SHA-256 が一致しません。既存のキャッシュは変更しません。');
  await mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.tmp.${randomUUID()}`;
  try { await writeFile(temp, data, { flag: 'wx' }); await rename(temp, target); }
  finally { await rm(temp, { force: true }); }
  return target;
}

export async function setup({ download = downloadAsset, target = mermaidAsset('mermaid.min.js') } = {}) {
  checkNode();
  return obtain(target, dependencies.url, dependencies.sha256, download);
}

export async function setupLicenses({ download = downloadAsset, directory = mermaidAsset('') } = {}) {
  let notices = `Mermaid ${dependencies.version} and bundled dependencies\n`;
  notices += 'Unmodified official full IIFE. License sources pinned from its source map.\n';
  notices += 'ELK source (EPL-2.0): https://github.com/kieler/elkjs/tree/v0.9.3\nhttps://github.com/eclipse/elk\n';
  for (const [source, expected] of Object.entries(dependencies.licenses)) {
    const target = path.join(directory, 'licenses', `${expected}.txt`);
    await obtain(target, `https://cdn.jsdelivr.net/npm/${source}`, expected, download);
    notices += `\n--- ${source} ---\n${await readFile(target, 'utf8')}\n`;
  }
  const target = path.join(directory, 'licenses.txt'), temp = `${target}.tmp.${randomUUID()}`;
  try { await writeFile(temp, notices, { flag: 'wx' }); await rename(temp, target); }
  finally { await rm(temp, { force: true }); }
  return target;
}

export async function main(args = process.argv.slice(2)) {
  const options = parseSetupArguments(args);
  if (options.help) { console.log(help); return; }
  if (options.ubuntuAction) {
    if (process.platform !== 'linux') throw new Error('Node.js / Pandoc の自動導入・削除は Ubuntu / WSL 専用です。Windows では公式インストーラーを使用してください。');
    const result = await run('bash', [resource('setup.sh'), options.ubuntuAction]);
    console.log(result.stdout.trim()); return;
  }
  checkNode();
  if (options.action) { console.log(await managePath(options.action, options)); return; }
  console.log(`Mermaid ${dependencies.version}: ready (${await setup()})`);
  await setupLicenses();
  await prepareCommand();
  console.log(pathInstructions());
  console.log('新しい端末で mdh --doctor を実行してください。');
}

if (isMainModule(import.meta.url)) {
  main().catch(error => { console.error(`setup: ${error.message}`); process.exitCode = 1; });
}
