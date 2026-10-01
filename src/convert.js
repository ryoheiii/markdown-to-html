import { readFile, writeFile, mkdir, mkdtemp, rm, rename, stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { run, checkPandoc } from './process.js';
import { resource, mermaidAsset, escapeHTML, utf8, localImage, checkAssets } from './assets.js';

export const reader = 'gfm-tex_math_dollars-tex_math_gfm-yaml_metadata_block';

async function sameFile(input, output) {
  try {
    const [a, b] = await Promise.all([stat(input, { bigint: true }), stat(output, { bigint: true })]);
    return a.dev === b.dev && a.ino === b.ino;
  } catch (e) { if (e.code === 'ENOENT') return false; throw e; }
}

export async function convert(inputArg, outputArg) {
  const input = path.resolve(inputArg);
  const output = outputArg ? path.resolve(outputArg) : path.join(path.dirname(input), path.basename(input, path.extname(input)) + '.html');
  if (input === output || await sameFile(input, output)) throw new Error('入力と出力が同じファイルです。入力は上書きできません。');
  const source = utf8(await readFile(input));
  const cwd = path.dirname(input);
  await checkPandoc(); await checkAssets();
  await mkdir(path.dirname(output), { recursive: true });
  const temp = await mkdtemp(path.join(path.dirname(output), '.mdh-'));
  const warnings = [];
  try {
    // UTF-8 validation and BOM removal precede Pandoc. Input path remains the image base.
    await writeFile(path.join(temp, 'input.md'), source);
    await run('pandoc', ['--from', reader, '--to', 'json', '--output', path.join(temp, 'ast.json'), path.join(temp, 'input.md')], { cwd });
    const ast = JSON.parse(await readFile(path.join(temp, 'ast.json'), 'utf8'));
    let mermaidCount = 0;
    async function walk(value) {
      if (Array.isArray(value)) return Promise.all(value.map(walk));
      if (!value || typeof value !== 'object') return value;
      if (value.t === 'RawBlock') return { t: 'CodeBlock', c: [['', [], []], value.c[1]] };
      if (value.t === 'RawInline') return { t: 'Str', c: value.c[1] };
      if (value.t === 'Image') {
        const filename = await localImage(value.c[2][0], cwd);
        value.c[2][0] = filename.split(path.sep).join('/');
      }
      if (value.t === 'Link' && /^(?:javascript|vbscript|data):/i.test(value.c[2][0])) return { t: 'Span', c: [['', [], []], await walk(value.c[1])] };
      if (value.t === 'CodeBlock' && value.c[0][1][0] === 'mermaid') {
        mermaidCount++;
        const code = value.c[1];
        // Mermaid config can inject CSS or override our locked rendering policy.
        // Decline these optional input features instead of implementing another parser.
        const unsupported = /^\s*---|%%\s*\{|<\s*(?:img|image|script|svg|iframe)\b|\b(?:img|icon)\s*:|\b(?:url\s*\(|@import)|\b(?:href|src)\s*=/im.test(code);
        return { t: 'RawBlock', c: ['html', `<figure class="mdh-diagram"${unsupported ? ' data-unsupported="true"' : ''}><p class="diagram-status" role="status">Mermaidの描画にはJavaScriptが必要です。</p><pre class="diagram-source"><code>${escapeHTML(code)}</code></pre></figure>`] };
      }
      for (const key of Object.keys(value)) value[key] = await walk(value[key]);
      return value;
    }
    await walk(ast);
    ast.meta = {}; // No document metadata can supply scripts, CSS or template variables.
    await writeFile(path.join(temp, 'ast.json'), JSON.stringify(ast));
    const css = await readFile(resource('assets/theme.css'), 'utf8');
    const app = await readFile(resource('assets/app.js'), 'utf8');
    let vendor = '';
    if (mermaidCount) {
      const js = await readFile(mermaidAsset('mermaid.min.js'), 'utf8');
      if (/<\/script/i.test(js)) throw new Error('Mermaidを安全にインライン化できません。');
      const notices = await readFile(mermaidAsset('licenses.txt'), 'utf8');
      vendor = `<script>${js}</script><details class="licenses"><summary>Mermaid / Third-party licenses</summary><pre>${escapeHTML(notices)}</pre></details>`;
    }
    await writeFile(path.join(temp, 'head.html'), `<style>${css}</style>`);
    const license = await readFile(resource('LICENSE'), 'utf8');
    await writeFile(path.join(temp, 'after.html'), `${vendor}<details class="licenses"><summary>mdh / MIT License</summary><pre>${escapeHTML(license)}</pre></details><script>${app}</script>`);
    const destination = path.join(temp, 'result.html');
    const result = await run('pandoc', ['--from', 'json', '--to', 'html5', '--standalone', '--embed-resources', '--toc', '--toc-depth=3', '--template', resource('assets/template.html'), '--syntax-highlighting', resource('assets/syntax.theme'), '--include-in-header', path.join(temp, 'head.html'), '--include-after-body', path.join(temp, 'after.html'), '--metadata', `pagetitle=${path.basename(input)}`, '--output', destination, path.join(temp, 'ast.json')], { cwd });
    if (result.stderr.trim()) {
      if (/CouldNotFetchResource|Could not fetch resource/i.test(result.stderr)) throw new Error(result.stderr.trim());
      warnings.push(result.stderr.trim());
    }
    if (!(await stat(destination)).size) throw new Error('Pandocが空のHTMLを返しました。');
    if (await sameFile(input, output)) throw new Error('入力と出力が同じファイルです。');
    await rename(destination, output);
    return { output, warnings, mermaidCount };
  } finally {
    // On WSL/DrvFS, rmdir on a non-empty folder can return EACCES instead of
    // ENOTEMPTY. This private workspace is flat: remove its files first.
    for (const name of await readdir(temp)) await rm(path.join(temp, name), { force: true, recursive: true, maxRetries: 6, retryDelay: 150 });
    await rm(temp, { recursive: true, force: true, maxRetries: 6, retryDelay: 150 });
  }
}
