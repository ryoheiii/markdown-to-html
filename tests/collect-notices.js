// Maintainer-only. Fetch recorded upstream versions, never during install/conversion.
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { command } from './helpers.js';
const sources = JSON.parse(await readFile('vendor/license-sources.json', 'utf8'));
const base = path.resolve('.tools/license-sources'); await mkdir(base, {recursive:true});
let notices = 'Mermaid 12.0.0 official full IIFE — upstream license collection\n\n';
notices += 'Pinned from the upstream release lockfile; intentionally inclusive of\ntype-only dependencies and multiple locked versions. Not every component\nlisted here executes in mdh.\n\n';
notices += 'ELK/elkjs EPL-2.0 source: https://github.com/kieler/elkjs/tree/v0.9.3\nELK source: https://github.com/eclipse/elk\nOfficial Mermaid bundle is unmodified.\n';
for (const {name, version} of sources) {
  const folder = path.join(base, `${name.replaceAll('/','_')}@${version}`); await mkdir(folder,{recursive:true});
  const url = `https://registry.npmjs.org/${name}/-/${name.split('/').at(-1)}-${version}.tgz`;
  const archive = path.join(folder,'source.tgz');
  try { await readFile(archive); } catch {
    if (!process.argv.includes('--fetch')) throw new Error(`Missing ${archive}; pass --fetch for maintainer download`);
    const response = await fetch(url); if (!response.ok) throw new Error(`${url}: ${response.status}`);
    await writeFile(archive, Buffer.from(await response.arrayBuffer()));
  }
  const result = await command('tar',['-xzf',archive,'-C',folder]); if (result.code) throw new Error(result.stderr);
  const pkgRoot = path.join(folder,(await readdir(folder,{withFileTypes:true})).find(entry=>entry.isDirectory()).name);
  const pkg = JSON.parse(await readFile(path.join(pkgRoot,'package.json'),'utf8'));
  const files = (await readdir(pkgRoot)).filter(file=>/^(?:licen[sc]e|copying|notice)(?:[.-]|$)/i.test(file));
  if (!files.length) throw new Error(`License missing: ${name}@${version}`);
  notices += `\n${'='.repeat(72)}\n${name}@${version} (${pkg.license})\n${url}\n`;
  for (const file of files) notices += `\n--- ${file} ---\n${await readFile(path.join(pkgRoot,file),'utf8')}\n`;
}
await writeFile('vendor/mermaid-notices.txt',notices);
const sha256 = {};
for (const name of ['mermaid.min.js', 'mermaid-notices.txt', 'MERMAID-LICENSE','license-sources.json']) sha256[name] = createHash('sha256').update(await readFile(`vendor/${name}`)).digest('hex');
await writeFile('vendor/manifest.json', JSON.stringify({ version: '12.0.0', source: 'https://registry.npmjs.org/mermaid/-/mermaid-12.0.0.tgz', sha256 }, null, 2) + '\n');
console.log(`Collected release-pinned licenses: ${sources.length}`);
