import { readFile, writeFile, mkdir, mkdtemp, rm, rename, stat, readdir, realpath } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import path from 'node:path';
import dependencies from '../dependencies.json' with { type: 'json' };

// Local assets and image validation
export const root = fileURLToPath(new URL('../', import.meta.url));
export const resource = name => path.join(root, name);
export const mermaidAsset = name => resource(`.cache/mermaid-${dependencies.version}/${name}`);
export const escapeHTML = value => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const utf8 = buffer => new TextDecoder('utf-8', { fatal: true }).decode(buffer);

export async function checkAssets() {
  for (const name of ['assets/template.html', 'assets/theme.css', 'assets/syntax.theme', 'assets/app.js', 'LICENSE']) {
    if (!(await stat(resource(name))).isFile()) throw new Error(`資産がありません: ${name}。clone先を確認してください。`);
  }
  try {
    const js = await readFile(mermaidAsset('mermaid.min.js'));
    if (createHash('sha256').update(js).digest('hex') !== dependencies.sha256) throw new Error('MermaidのSHA-256が一致しません');
    if (!(await stat(mermaidAsset('licenses.txt'))).isFile()) throw new Error('ライセンス表示がありません');
  } catch (error) {
    throw new Error(`Mermaidのsetupが必要です。clone先で node setup.js を実行してください。(${error.message})`);
  }
  return `Mermaid ${dependencies.version}`;
}

export async function localImage(target, directory) {
  // Native absolute paths are allowed; URL schemes (including data/file) are not input assets.
  if (target.startsWith('//') || (!path.isAbsolute(target) && /^[a-z][a-z0-9+.-]*:/i.test(target))) throw new Error(`外部画像・URL画像は非対応です: ${target}`);
  let decoded;
  try { decoded = decodeURIComponent(target); } catch { throw new Error(`画像パスのURLエンコードが不正です: ${target}`); }
  if (decoded.startsWith('//') || (!path.isAbsolute(decoded) && /^[a-z][a-z0-9+.-]*:/i.test(decoded))) throw new Error(`外部画像は非対応です: ${target}`);
  const filename = path.resolve(directory, decoded);
  const extension = path.extname(filename).toLowerCase();
  if (!['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(extension)) throw new Error(`非対応の画像形式です: ${target}`);
  const actual = await realpath(filename);
  if (!(await stat(actual)).isFile()) throw new Error(`画像がファイルではありません: ${target}`);
  const bytes = await readFile(actual);
  if (extension === '.svg') {
    const text = utf8(bytes);
    // This is a conservative dependency check, not an SVG sanitizer.
    if (/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet|<(?:[\w.-]+:)?(?:script|foreignObject)\b|\bon\w+\s*=|@import|@font-face/i.test(text)
      || [...text.matchAll(/\b(?:[\w.-]+:)?href\s*=\s*(["'])(.*?)\1/gis)].some(m => !m[2].startsWith('#'))
      || [...text.matchAll(/url\s*\((.*?)\)/gis)].some(m => !/^\s*["']?#[-\w.:]+["']?\s*$/.test(m[1]))
      || /\\[0-9a-f]{1,6}|\\(?:u|x)|\b(?:src)\s*=/i.test(text)) {
      throw new Error(`SVGの外部参照・スクリプト・埋め込み文書は非対応です: ${target}。依存のないSVGにしてください。`);
    }
  }
  // Pandoc does the actual resource embedding from the resolved native path.
  return actual;
}

// Pandoc process
// Stream-sized outputs are written by Pandoc to files, never exec's maxBuffer.
export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout = (stdout + chunk).slice(-65536); });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-65536); });
    child.on('error', e => reject(new Error(`${command}: ${e.message}${e.code === 'ENOENT' ? ' — PATHを確認してください。mdh --doctor も利用できます。' : ''}`)));
    child.on('close', code => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`${command} failed (${code}): ${stderr.trim() || stdout.trim()}`)));
  });
}

export async function checkPandoc() {
  const { stdout } = await run('pandoc', ['--version']);
  const match = /^pandoc (\d+)\.(\d+)(?:\.(\d+))?/.exec(stdout);
  if (!match || +match[1] !== 3 || +match[2] < 8) throw new Error('Pandoc 3.8以上、4未満が必要です。https://pandoc.org/installing.html');
  return stdout.split(/\r?\n/)[0];
}

// Markdown to standalone HTML
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
