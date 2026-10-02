import { readFile, writeFile, mkdir, mkdtemp, rm, rename, stat, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { resource, checkNode, parsePandocVersion, highlightingArgs } from './environment.js';
import { checkAssets, readMermaid, mermaidAsset, utf8, escapeHTML } from './assets.js';
import { createPandoc, checkPandoc } from './pandoc.js';

export { resource } from './environment.js';
export { checkAssets, mermaidAsset } from './assets.js';
export { run, checkPandoc } from './pandoc.js';

async function sameFile(input, output) {
  try {
    const [a, b] = await Promise.all([stat(input, { bigint: true }), stat(output, { bigint: true })]);
    return a.dev === b.dev && a.ino === b.ino;
  } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

export async function convert(inputArg, outputArg, {
  numberSections = true, cssFile, afterBodyFile, container = false,
} = {}) {
  checkNode();
  const input = path.resolve(inputArg);
  const output = outputArg ? path.resolve(outputArg) : path.join(path.dirname(input), path.basename(input, path.extname(input)) + '.html');
  if (/\.html?$/i.test(input)) throw new Error('HTML ファイルを入力には使用できません。');
  if (input === output || await sameFile(input, output)) throw new Error('入力と出力が同じファイルです。入力は上書きできません。');
  if (!(await stat(input)).isFile()) throw new Error('入力がファイルではありません。');
  const source = utf8(await readFile(input));
  const cwd = path.dirname(input);
  await checkAssets();
  const css = utf8(await readFile(cssFile ? path.resolve(cssFile) : resource('assets/theme.css')));
  const app = afterBodyFile ? utf8(await readFile(path.resolve(afterBodyFile))) : `<script>${await readFile(resource('assets/app.js'), 'utf8')}</script>`;
  await mkdir(path.dirname(output), { recursive: true });
  const temp = await mkdtemp(path.join(path.dirname(output), '.mdh-'));
  const warnings = [];
  try {
    const pandoc = await createPandoc({ container, cwd, temp });
    const version = parsePandocVersion(await checkPandoc(pandoc.run));
    const inputTemp = path.join(temp, 'input.md'), astFile = path.join(temp, 'ast.json');
    await writeFile(inputTemp, source.replace(/^\ufeff/, ''));
    const parsed = await pandoc.run(['--from', 'markdown', '--to', 'json', '--output', astFile, inputTemp]);
    if (parsed.stderr.trim()) warnings.push(parsed.stderr.trim());
    const ast = JSON.parse(await readFile(astFile, 'utf8'));
    let mermaidCount = 0;
    function walk(value) {
      if (Array.isArray(value)) return value.map(walk);
      if (!value || typeof value !== 'object') return value;
      if (value.t === 'CodeBlock' && value.c[0][1].includes('mermaid')) {
        mermaidCount++;
        const code = value.c[1];
        return { t: 'RawBlock', c: ['html', `<figure class="mdh-diagram"><p class="diagram-status" role="status">Mermaid の描画には JavaScript が必要です。</p><pre class="diagram-source"><code>${escapeHTML(code)}</code></pre></figure>`] };
      }
      for (const key of Object.keys(value)) value[key] = walk(value[key]);
      return value;
    }
    // Keep Pandoc's body and metadata intact except for Mermaid code blocks.
    ast.blocks = walk(ast.blocks);
    if (!ast.meta.title?.c?.length && !ast.meta.pagetitle) ast.meta.pagetitle = { t: 'MetaString', c: path.basename(input) };
    const vendor = mermaidCount ? `<script>${await readMermaid()}</script>` : '';
    const license = await readFile(resource('LICENSE'), 'utf8');
    let notices = `<details class="licenses"><summary>mdh / MIT License</summary><pre>${escapeHTML(license)}</pre></details>`;
    if (mermaidCount) {
      const thirdParty = await readFile(mermaidAsset('licenses.txt'), 'utf8').catch(() => {
        throw new Error('Mermaid のライセンスがありません。node setup.js を実行してください。');
      });
      notices += `<details class="licenses"><summary>Mermaid / Third-party licenses</summary><pre>${escapeHTML(thirdParty)}</pre></details>`;
    }
    // Keep the multi-megabyte, verified library out of Pandoc's HTML resource
    // scanner. Images and custom assets must still use --embed-resources.
    const vendorMarker = vendor ? `<!--mdh-mermaid-${randomUUID()}-->` : '';
    const raw = html => ({ t: 'MetaBlocks', c: [{ t: 'RawBlock', c: ['html', html.replace(/\r\n?/g, '\n')] }] });
    const includes = key => !ast.meta[key] ? [] : ast.meta[key].t === 'MetaList' ? ast.meta[key].c : [ast.meta[key]];
    // CLI --include-* replaces YAML includes; merge assets into metadata instead.
    ast.meta['header-includes'] = { t: 'MetaList', c: [raw(`<style>${css}</style>`), ...includes('header-includes')] };
    ast.meta['include-after'] = { t: 'MetaList', c: [raw(vendorMarker), ...includes('include-after'), raw(notices), raw(app)] };
    await writeFile(astFile, JSON.stringify(ast));
    const destination = path.join(temp, 'result.html');
    const result = await pandoc.run([
      '--from', 'json', '--to', 'html5', '--standalone', '--embed-resources', '--eol=lf',
      '--toc', '--toc-depth=4', ...(numberSections ? ['--number-sections'] : []),
      '--template', resource('assets/template.html'), ...highlightingArgs(version, resource('assets/syntax.theme')),
      '--variable', `toc-id=${cssFile || afterBodyFile ? 'TOC' : 'mdh-toc'}`,
      '--output', destination, astFile,
    ]);
    if (result.stderr.trim()) {
      if (/CouldNotFetchResource|Could not fetch resource/i.test(result.stderr)) throw new Error(result.stderr.trim());
      warnings.push(result.stderr.trim());
    }
    if (!(await stat(destination)).size) throw new Error('Pandoc が空の HTML を返しました。');
    if (vendor) {
      const html = await readFile(destination, 'utf8');
      if (!html.includes(vendorMarker)) throw new Error('Mermaid の埋め込み位置を確認できません。');
      // A replacement callback preserves literal $&, $` and $' in JavaScript.
      await writeFile(destination, html.replace(vendorMarker, () => vendor));
    }
    if (await sameFile(input, output)) throw new Error('入力と出力が同じファイルです。');
    await rename(destination, output);
    return { output, warnings, mermaidCount, pandocVersion: version };
  } finally {
    // WSL/DrvFS can report EACCES for a non-empty directory: remove files first.
    for (const name of await readdir(temp)) await rm(path.join(temp, name), { force: true, recursive: true, maxRetries: 6, retryDelay: 150 });
    await rm(temp, { recursive: true, force: true, maxRetries: 6, retryDelay: 150 });
  }
}
