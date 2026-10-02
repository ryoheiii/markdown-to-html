import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir, link, cp, symlink, realpath } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Script } from 'node:vm';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { convert } from '../src/convert.js';
import { root, resource, atLeast, checkNode, parsePandocVersion, highlightingArgs } from '../src/environment.js';
import { readMermaid } from '../src/assets.js';
import { parseArguments } from '../src/cli.js';
import { prepareCommand } from '../src/path-setup.js';
import { openHtml, windowsOpenScript } from '../src/open.js';
import { run } from '../src/pandoc.js';

async function fixture(t, content = '# 概要\n\n## 目的\n\n### 範囲\n\n# 導入\n') {
  const dir = await mkdtemp(path.join(tmpdir(), 'mdh-core-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const input = path.join(dir, '資料 & (test) #%.md'), output = path.join(dir, '資料 & (test) #%.html');
  await writeFile(input, content);
  return { dir, input, output };
}
const cli = (args, options = {}) => spawnSync(process.execPath, [resource('src/cli.js'), ...args], { encoding: 'utf8', ...options });

const elementContents = (html, pattern) => {
  const match = html.match(pattern);
  assert(match, `output contains ${pattern}`);
  return match[1].trim();
};
const mainBody = html => elementContents(html, /<main id="mdh-content">\s*([\s\S]*?)\s*<\/main>/);
const normalizeWhitespace = value => value.replace(/\s+/g, ' ');
function assertStandardTitle(html, direct) {
  // Different title-card class lengths change Pandoc's automatic line wrapping.
  assert.equal(normalizeWhitespace(elementContents(html, /<h1 class="document-title">([\s\S]*?)<\/h1>/)), normalizeWhitespace(elementContents(direct, /<h1 class="title">([\s\S]*?)<\/h1>/)));
  assert.equal(normalizeWhitespace(elementContents(html, /<title>([\s\S]*?)<\/title>/)), normalizeWhitespace(elementContents(direct, /<title>([\s\S]*?)<\/title>/)));
}
async function directPandoc(input, { embedResources = false } = {}) {
  const { stdout: version } = await run('pandoc', ['--version']);
  const result = await run('pandoc', [
    '-f', 'markdown', '-t', 'html5', '--eol=lf', '--number-sections',
    ...highlightingArgs(parsePandocVersion(version), resource('assets/syntax.theme')),
    '--standalone', ...(embedResources ? ['--embed-resources'] : []), input,
  ], { cwd: path.dirname(input) });
  assert.doesNotMatch(result.stderr, /CouldNotFetchResource|Could not fetch resource/i);
  return result.stdout;
}
async function assertStandardBody(input, output) {
  const direct = await directPandoc(input, { embedResources: true });
  await convert(input, output);
  const html = await readFile(output, 'utf8');
  const expected = elementContents(direct, /<body>\s*([\s\S]*?)\s*<\/body>/);
  assert.equal(mainBody(html), expected, 'main body equals direct Pandoc markdown → html5 (same numbering, highlighting and embedding options)');
  return html;
}
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const dataImage = `data:image/png;base64,${png.toString('base64')}`;

test('minimum versions and future major versions are accepted without requiring replacement', async () => {
  for (const version of ['20.20.0', '22.22.1', '24.21.0', '26.0.0']) assert.equal(checkNode(version), version);
  for (const version of ['18.20.8', '20.19.9', 'invalid']) assert.throws(() => checkNode(version), /20.20.0/);
  for (const version of ['3.1.3', '3.1.13', '3.8', '3.8.1', '4.0']) assert.equal(parsePandocVersion(`pandoc ${version}\nFeatures: +lua`), version);
  for (const version of ['2.19', '3.1.2']) assert.throws(() => parsePandocVersion(`pandoc ${version}`), /3.1.3/);
  assert(atLeast('22.0.0', '20.20.0'));
  assert.deepEqual(highlightingArgs('3.1.3', 'theme'), ['--highlight-style', 'theme']);
  assert.deepEqual(highlightingArgs('3.8', 'theme'), ['--syntax-highlighting', 'theme']);
  assert.deepEqual(highlightingArgs('4.0', 'theme'), ['--syntax-highlighting', 'theme']);
  assert.equal(JSON.parse(await readFile(resource('package.json'), 'utf8')).engines.node, '>=20.20.0');
});

test('theme and syntax colors meet WCAG AA contrast on their backgrounds', async () => {
  const luminance = hex => hex.match(/[0-9a-f]{2}/gi).map(c => parseInt(c, 16) / 255)
    .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
  const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
  const syntax = JSON.parse(await readFile(resource('assets/syntax.theme'), 'utf8'));
  for (const color of [syntax['text-color'], syntax['line-number-color'], ...Object.values(syntax['text-styles']).map(style => style['text-color'])]) {
    assert(contrast(color, syntax['background-color']) >= 4.5, `${color} on ${syntax['background-color']}`);
  }
  const css = await readFile(resource('assets/theme.css'), 'utf8');
  const vars = Object.fromEntries([...css.match(/:root\{([^}]*)\}/)[1].matchAll(/--([\w-]+):(#[0-9a-f]{6})/gi)].map(m => [m[1], m[2]]));
  for (const [foreground, background, minimum] of [
    ['text', '#ffffff', 7], ['heading', '#ffffff', 7], ['subheading', '#ffffff', 7], ['muted', '#ffffff', 4.5], ['link', '#ffffff', 4.5], ['accent', '#ffffff', 4.5],
    ['text', vars.quote, 7], ['accent', vars.quote, 3], ['text', vars['inline-code'], 7], ['text', vars.surface, 7],
    ['table-head-text', vars['table-head'], 7],
    ['inline-fg', vars['inline-code'], 4.5],
    ['nav-text', vars['nav-bg'], 7], ['nav-sub', vars['nav-bg'], 7], ['nav-muted', vars['nav-bg'], 4.5], ['nav-accent', vars['nav-active'], 3],
    ['nav-text', vars['nav-end'], 7], ['nav-sub', vars['nav-end'], 7], ['nav-muted', vars['nav-end'], 4.5],
  ]) {
    const fg = foreground.startsWith('#') ? foreground : vars[foreground];
    assert(contrast(fg, background) >= minimum, `${foreground} on ${background}: ${contrast(fg, background).toFixed(2)}`);
  }
  assert(contrast('#ffffff', vars['nav-active']) >= 7 && contrast('#ffffff', vars['nav-hover']) >= 7);
});

test('browser JavaScript is valid and contains no script closing sequence', async () => {
  const script = await readFile(resource('assets/app.js'), 'utf8');
  assert.doesNotThrow(() => new Script(script)); assert.doesNotMatch(script, /<\/script/i);
});

test('CLI defaults, explicit asset options and literal input', () => {
  assert.equal(parseArguments(['doc.md']).options.numberSections, true);
  assert.equal(parseArguments(['doc.md', '--number-sections']).options.numberSections, true);
  assert.equal(parseArguments(['doc.md', '--no-number-sections']).options.numberSections, false);
  assert.equal(parseArguments(['doc.md', '--number-sections', '--no-number-sections']).options.numberSections, false);
  assert.equal(parseArguments(['doc.md', '--no-number-sections', '--number-sections']).options.numberSections, true);
  assert.equal(parseArguments(['doc.md', '--css', 'custom.css']).options.cssFile, 'custom.css');
  assert.equal(parseArguments(['doc.md', '--after-body', 'custom.html']).options.afterBodyFile, 'custom.html');
  assert.equal(parseArguments(['doc.md', '--container']).options.container, true);
  assert.equal(parseArguments(['--', '-file.md']).input, '-file.md');
  for (const args of [['--bad'], ['a.md', '--css', ''], ['a.md', '-o', 'one', '-o', 'two'], ['--help', 'a.md']]) assert.throws(() => parseArguments(args));
});

test('section numbering is enabled by default, can be disabled and the TOC contains exactly four levels', async t => {
  const { input, output } = await fixture(t, '# Parent\n\n## Child\n\n### Nested\n\n#### Deep\n\n##### Deeper\n\n###### Deepest\n\n# Second\n');
  const source = await readFile(input, 'utf8');
  await convert(input); const numbered = await readFile(output, 'utf8');
  for (const number of ['1', '1.1', '1.1.1', '1.1.1.1', '2']) {
    assert(numbered.includes(`class="header-section-number">${number}</span>`));
    assert(numbered.includes(`class="toc-section-number">${number}</span>`));
  }
  await convert(input, undefined, { numberSections: false }); const plain = await readFile(output, 'utf8');
  assert.doesNotMatch(plain, /class="(?:header|toc)-section-number"/);
  const ids = html => [...html.matchAll(/<h[1-6]\b[^>]*\bid="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(ids(plain), ids(numbered)); assert.equal(await readFile(input, 'utf8'), source);
  for (const html of [plain, numbered]) {
    assert.match(html, /href="#deep"/);
    assert.match(html, /<h5\b[^>]*id="deeper"/); assert.match(html, /<h6\b[^>]*id="deepest"/);
    assert.doesNotMatch(html, /href="#(?:deeper|deepest)"/);
  }
});

test('YAML title produces an unnumbered title card and tab name, not a TOC entry', async t => {
  const title = '日本語のサンプル文書';
  const content = `\ufeff---\r\ntitle: ${title}\r\n---\r\n# はじめに\r\n\r\n## 手順\r\n`;
  const { input, output } = await fixture(t, content);
  await convert(input);
  const html = (await readFile(output, 'utf8')).replace(/\s+/g, ' ');
  assert.match(html, new RegExp(`<title>${title}</title>`));
  assert.match(html, new RegExp(`<header class="document-header" aria-label="文書タイトル">\\s*<h1 class="document-title">${title}</h1>\\s*</header>`));
  assert.match(html, /id="はじめに"><span class="header-section-number">1<\/span>/);
  const toc = html.match(/<nav\b[\s\S]*?<\/nav>/)[0];
  assert(!toc.includes(title));
  assert.equal(await readFile(input, 'utf8'), content);
});

test('YAML metadata reaches the template with standard title formatting and local CSS embedding', async t => {
  const { input, output } = await fixture(t, [
    '---',
    'title: |', '  **太字** *斜体* `code` [参照](#本文) "引用"', '  日本語 & <案内>',
    'pagetitle: explicit tab title',
    'subtitle: \'*副題*\'',
    'author:', '  - Alice', '  - \'**Bob**\'',
    'date: \'2026-10-02\'',
    'lang: ar', 'dir: rtl',
    'header-includes:', '  - <meta name="metadata-marker" content="kept">',
    '  - <script>globalThis.metadataHeader = true;</script>',
    'include-before:', '  - <aside id="metadata-before">before</aside>',
    'include-after:', '  - <aside id="metadata-after">after</aside>',
    'css: metadata.css',
    '---', '# 本文', '',
  ].join('\n'));
  await writeFile(path.join(path.dirname(input), 'metadata.css'), '.metadata-marker { color: rgb(1, 2, 3); }');
  const direct = await directPandoc(input, { embedResources: true });
  await convert(input); const html = await readFile(output, 'utf8');
  assertStandardTitle(html, direct);
  assert.match(html, /<strong>太字<\/strong>\s+<em>斜体<\/em>\s+<code>code<\/code>/);
  for (const className of ['subtitle', 'author', 'date']) {
    const pattern = new RegExp(`<p class="${className}">[\\s\\S]*?<\\/p>`, 'g');
    assert.deepEqual(html.match(pattern)?.map(normalizeWhitespace), direct.match(pattern)?.map(normalizeWhitespace));
  }
  assert.match(html, /<html lang="ar" dir="rtl">/);
  assert.match(html, /\.metadata-marker\s*\{\s*color: rgb\(1, 2, 3\);\s*\}/);
  assert.doesNotMatch(html, /href="metadata\.css"|Content-Security-Policy/i);
  assert(html.indexOf('id="metadata-before"') < html.indexOf('<header class="document-header"'));
  const includePatterns = [
    /<meta name="metadata-marker" content="kept"\s*\/?>/,
    /<script>globalThis\.metadataHeader = true;<\/script>/,
    /<aside id="metadata-before">[\s\S]*?<\/aside>/,
    /<aside id="metadata-after">[\s\S]*?<\/aside>/,
  ];
  const directIncludes = includePatterns.map(pattern => direct.match(pattern)?.[0]);
  assert(directIncludes.every(Boolean), 'direct Pandoc renders all YAML includes');
  // YAML include fragments are Markdown metadata: use Pandoc's rendered form,
  // not their input spelling (which can acquire paragraph breaks).
  assert.deepEqual(includePatterns.map(pattern => html.match(pattern)?.[0]).map(value => value && normalizeWhitespace(value)), directIncludes.map(normalizeWhitespace), 'YAML header-includes, include-before and include-after are retained');
  assert(html.indexOf('id="metadata-after"') > html.indexOf('</main>'));
});

test('documents without titles use the escaped filename or explicit pagetitle for the tab', async t => {
  const { input, output } = await fixture(t);
  for (const [content, title] of [
    ['# 本文\n', '資料 &amp; (test) #%.md'],
    ['---\ntitle: ""\n---\n# 本文\n', '資料 &amp; (test) #%.md'],
    ['---\npagetitle: explicit tab\n---\n# 本文\n', 'explicit tab'],
  ]) {
    await writeFile(input, content); await convert(input);
    const html = await readFile(output, 'utf8');
    assert.doesNotMatch(html, /<header class="document-header"/);
    assert.equal(elementContents(html, /<title>([\s\S]*?)<\/title>/), title);
  }
});

for (const content of ['![画像](missing.png)', '<figure>\n<img src="missing.png">\n<figcaption>図</figcaption>\n</figure>']) {
  test(`missing image preserves old output: ${content.startsWith('!') ? 'Markdown' : 'HTML'}`, async t => {
    const { dir, input, output } = await fixture(t, content);
    await writeFile(output, 'previous'); await assert.rejects(convert(input), /CouldNotFetchResource|Could not fetch resource/i);
    assert.equal(await readFile(output, 'utf8'), 'previous'); assert(!(await readdir(dir)).some(name => name.startsWith('.mdh-')));
  });
}

test('standard markdown reader and html5 writer preserve attributes, raw HTML, lists, math and tables', async t => {
  const content = (await Promise.all(['pandoc.md', 'formatting.md'].map(name => readFile(resource(`tests/fixtures/${name}`), 'utf8')))).join('\n\n');
  const { input, output } = await fixture(t, content);
  const html = await assertStandardBody(input, output);
  assert.match(html, /<strong>【例】<\/strong>日本語の本文/);
  assert.equal(await readFile(input, 'utf8'), content);
});

test('local and data images, HTML figures and encoded SVG filenames follow Pandoc embedding', async t => {
  const content = [
    '\ufeff# 画像', '',
    '![SVG](%E5%9B%B3%20%26%20%23%25.svg){#svg-image .diagram width=65% style="border:1px solid red;" data-kind=svg onload="void(0)"}', '',
    '<figure style="text-align: center;">',
    '  <img src="図%20&amp;%20%23%25.svg" alt="図 &amp; &quot;説明&quot;" width="65%" height="65%" />',
    '  <figcaption>SVG</figcaption>', '</figure>', '',
    '1. 入れ子の図', '', '    <figure style="text-align: center;">',
    '        <img src="image.png" style="width:698px; height:192px; position:relative;" onerror="void(0)" srcset="image.png 2x" id="image-id" data-display="kept" />',
    '        <figcaption>Figure 1: **画面**</figcaption>', '    </figure>', '',
    `![data image](${dataImage}){width=24 data-image=kept}`, '',
    `文中の画像 <img src="${dataImage}" width="24" data-image="kept"> です。`, '',
    '![BMP](image.bmp)', '', '<img src="image.bmp" width="32" srcset="image.bmp 2x">', '',
  ].join('\r\n');
  const { dir, input } = await fixture(t, content), output = path.join(dir, '配布用', 'alone.html');
  await writeFile(path.join(dir, 'image.png'), png);
  await writeFile(path.join(dir, '図 & #%.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><defs><path id="shape" d="M0 0h20v20H0z"/></defs><style>.shape{fill:red}</style><use class="shape" href="#shape"/></svg>');
  const bmp = Buffer.alloc(58);
  bmp.write('BM'); bmp.writeUInt32LE(bmp.length, 2); bmp.writeUInt32LE(54, 10); bmp.writeUInt32LE(40, 14);
  bmp.writeInt32LE(1, 18); bmp.writeInt32LE(1, 22); bmp.writeUInt16LE(1, 26); bmp.writeUInt16LE(24, 28);
  bmp.writeUInt32LE(4, 34); bmp[56] = 255;
  await writeFile(path.join(dir, 'image.bmp'), bmp);
  const html = await assertStandardBody(input, output);
  assert.match(html, /(?:data:image\/svg\+xml|<svg\b)/);
  assert.match(html, /data:image\/png;base64,/); assert.match(html, /data:image\/(?:bmp|x-ms-bmp);base64,/);
  assert(!html.includes('\r')); assert.equal(await readFile(input, 'utf8'), content);
});

test('remote Markdown and HTML images use only a local loopback server and Pandoc resource embedding', async t => {
  // Pandoc can honor inherited proxies even for loopback URLs. Never route this
  // fixture through an external proxy; restore the environment after the test.
  const proxyKeys = Object.keys(process.env).filter(key => /^(?:https?|all|no)_proxy$/i.test(key));
  const savedProxy = Object.fromEntries(proxyKeys.map(key => [key, process.env[key]]));
  for (const key of proxyKeys) delete process.env[key];
  process.env.NO_PROXY = process.env.no_proxy = '*';
  t.after(() => {
    for (const key of [...proxyKeys, 'NO_PROXY', 'no_proxy']) delete process.env[key];
    Object.assign(process.env, savedProxy);
  });
  const requests = [];
  const server = createServer((request, response) => {
    requests.push(request.url);
    if (request.url !== '/image.png') { response.writeHead(404).end(); return; }
    response.writeHead(200, { 'Content-Type': 'image/png' }); response.end(png);
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const base = `http://127.0.0.1:${server.address().port}`;
  const { input, output } = await fixture(t, [
    `![remote](${base}/image.png){#remote-image width=24 data-source=remote}`, '',
    `<img src="${base}/image.png" width="65%" onerror="void(0)" srcset="${base}/image.png 2x">`, '',
    `<img src="${base.replace('http:', 'http&#58;')}/image.png" data-source="entity-url">`, '',
  ].join('\n'));
  // Async child processes leave the event loop free to serve Pandoc's requests.
  const html = await assertStandardBody(input, output);
  assert.equal((mainBody(html).match(/<img\b/g) || []).length, 3);
  assert.equal((mainBody(html).match(/src="data:image\/png;base64,/g) || []).length, 3);
  assert(requests.length >= 2, 'both direct Pandoc and mdh fetch the local resource');
  assert(requests.every(url => url === '/image.png'));
});

test('same path, hardlink, invalid UTF-8 and output directory do not overwrite input', async t => {
  const { dir, input } = await fixture(t);
  const source = await readFile(input, 'utf8');
  await assert.rejects(convert(input, input), /同じ/);
  const alias = path.join(dir, 'alias.html'); await link(input, alias);
  await assert.rejects(convert(input, alias), /同じ/);
  const directory = path.join(dir, 'directory.html'); await mkdir(directory);
  await assert.rejects(convert(input, directory)); assert.equal(await readFile(input, 'utf8'), source);
  await writeFile(input, Buffer.from([0xff, 0xfe])); await assert.rejects(convert(input));
  assert(!(await readdir(dir)).some(name => name.startsWith('.mdh-')));
});

test('Windows opener passes a canonical Unicode path through the environment, not a file URL', async t => {
  const { dir } = await fixture(t);
  const folder = path.join(dir, "配置 日本語 O'Brien & (test) #%"), alias = path.join(dir, 'alias');
  await mkdir(folder); await symlink(folder, alias, process.platform === 'win32' ? 'junction' : 'dir');
  const name = "サンプル 資料 #100% & (test) O'Brien.html", filename = path.join(alias, name);
  await writeFile(path.join(folder, name), '<html><body>日本語</body></html>');
  let calls = 0;
  await openHtml(filename, { platform: 'win32', runner: async (command, args, options) => {
    calls++; assert.equal(command, 'powershell.exe');
    assert.deepEqual(args.slice(0, 3), ['-NoProfile', '-NonInteractive', '-EncodedCommand']);
    assert.equal(Buffer.from(args[3], 'base64').toString('utf16le'), windowsOpenScript);
    assert.equal(options.env.MDH_OPEN_FILE, await realpath(filename));
    assert(!options.env.MDH_OPEN_FILE.startsWith('file:'));
    assert(!args.some(arg => arg.includes(name)), 'filenames must not be interpolated into shell commands');
  } });
  assert.equal(calls, 1);
  await assert.rejects(openHtml(path.join(dir, 'missing.html'), { platform: 'win32', runner: async () => { throw Error('must not launch'); } }), { code: 'ENOENT' });
  await openHtml(filename, { platform: 'linux', runner: async (command, args) => {
    assert.equal(command, 'xdg-open'); assert.deepEqual(args, [pathToFileURL(filename).href]);
  } });
});

test('Windows opener script preserves Japanese output and errors without starting a browser', { skip: process.platform !== 'win32' }, async t => {
  const { dir } = await fixture(t), filename = path.join(dir, '資料 日本語 & (test) #100%.html');
  await writeFile(filename, '<html></html>');
  const mock = String.raw`
function Start-Process {
  param([string] $FilePath, [string] $ErrorAction)
  if ($env:MDH_OPEN_TEST_FAIL -eq '1') { throw '指定されたファイルが見つかりません。' }
  if (-not (Test-Path -LiteralPath $FilePath -PathType Leaf)) { throw 'Wrong filename received.' }
  [Console]::WriteLine($FilePath)
}
`;
  const args = ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(mock + windowsOpenScript, 'utf16le').toString('base64')];
  const env = { ...process.env, MDH_OPEN_FILE: filename, MDH_OPEN_TEST_FAIL: '0' };
  const result = await run('powershell.exe', args, { env });
  assert.equal(result.stdout.trim(), filename); assert.equal(result.stderr, '');
  await assert.rejects(run('powershell.exe', args, { env: { ...env, MDH_OPEN_TEST_FAIL: '1' } }), error => {
    assert.match(error.message, /指定されたファイルが見つかりません。/);
    assert.doesNotMatch(error.message, /\uFFFD|CLIXML/); return true;
  });
});

test('missing Pandoc leaves output intact; browser open failure is only a warning', async t => {
  const { dir, input, output } = await fixture(t); await writeFile(output, 'previous');
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.toLowerCase() === 'path') delete env[key];
  env.PATH = dir;
  const missing = cli([input], { env }); assert.equal(missing.status, 1); assert.match(missing.stderr, /PATH/);
  assert.equal(await readFile(output, 'utf8'), 'previous');
  const found = spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', ['pandoc'], { encoding: 'utf8' });
  assert.equal(found.status, 0);
  const executable = found.stdout.trim().split(/\r?\n/)[0];
  if (process.platform === 'win32') env.PATH = path.dirname(executable);
  else { await symlink(executable, path.join(dir, 'pandoc')); env.PATH = dir; }
  const opened = cli([input, '--open'], { env }); assert.equal(opened.status, 0, opened.stderr); assert.match(opened.stderr, /warning/);
});

test('PATH-based mdh works from another directory after relocation; Mermaid-free files do not need setup', async t => {
  const { dir, input, output: defaultOutput } = await fixture(t);
  const checkout = path.join(dir, '配置 日本語 & (test)'); await mkdir(checkout);
  for (const name of ['src', 'assets', 'bin', 'LICENSE', 'package.json', 'dependencies.json', 'setup.js']) await cp(path.join(root, name), path.join(checkout, name), { recursive: true });
  const result = spawnSync(process.execPath, [path.join(checkout, 'bin/mdh'), input], { cwd: dir, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), defaultOutput);
  const bin = path.join(checkout, 'bin'); await prepareCommand(bin);
  const env = { ...process.env };
  const originalPath = Object.entries(env).find(([key]) => key.toLowerCase() === 'path')?.[1] || '';
  for (const key of Object.keys(env)) if (key.toLowerCase() === 'path') delete env[key];
  env.PATH = [bin, path.dirname(process.execPath), originalPath].join(path.delimiter);
  for (const shell of process.platform === 'win32' ? ['powershell.exe'] : ['bash', 'zsh']) {
    if (shell !== 'powershell.exe' && spawnSync(shell, ['--version'], { env }).error?.code === 'ENOENT') {
      t.diagnostic(`${shell} is not installed; skipped`); continue;
    }
    const command = args => shell === 'powershell.exe'
      ? spawnSync(shell, ['-NoProfile', '-NonInteractive', '-Command', '$mdhArgs = @(ConvertFrom-Json $env:MDH_TEST_ARGS); & mdh @mdhArgs; exit $LASTEXITCODE'], {
        cwd: dir, env: { ...env, MDH_TEST_ARGS: JSON.stringify(args) }, encoding: 'utf8', windowsHide: true,
      })
      : spawnSync(shell, ['-c', 'mdh "$@"', 'mdh-test', ...args], { cwd: dir, env, encoding: 'utf8' });
    const converted = command([path.relative(dir, input), '-o', '配布/result.html']);
    assert.equal(converted.status, 0, converted.stderr);
    assert.equal(converted.stdout.trim(), path.join(dir, '配布/result.html'));
    assert.match(await readFile(path.join(dir, '配布/result.html'), 'utf8'), /class="header-section-number">1<\/span>/);
  }
  await writeFile(input, '# Diagram\n\n```mermaid\nflowchart LR\nA --> B\n```\n');
  const output = path.join(dir, 'diagram.html'); await writeFile(output, 'previous');
  const missing = spawnSync(process.execPath, [path.join(checkout, 'src/cli.js'), input, '-o', output], { encoding: 'utf8' });
  assert.equal(missing.status, 1); assert.match(missing.stderr, /node setup.js/); assert.equal(await readFile(output, 'utf8'), 'previous');
});

let mermaid;
try { mermaid = await readMermaid(); } catch { /* optional cache */ }
test('Mermaid preserves sources and settings in nested/escaped fences and embeds the library once', { skip: !mermaid }, async t => {
  const diagrams = [
    '---\nconfig:\n  theme: dark\n---\nflowchart LR\nA["<b>label</b>"] --> B',
    '%%{init: {"theme":"neutral"}}%%\nflowchart LR\nA --> B\nclassDef emphasis fill:#f9f,stroke:#333;\nclass A emphasis;',
    'flowchart LR\nA["<span style=\'color:red\'>label</span>"] --> B\nclick A href "#target" "local link"',
  ];
  const fences = diagrams.map(code => '```mermaid\n' + code + '\n```');
  const { input, output } = await fixture(t, '# 図\n\n' + fences[0].split('\n').map(line => '> ' + line).join('\n') + '\n\n' + fences.slice(1).join('\n\n') + '\n\n````markdown\n```mermaid\nnot a diagram\n```\n````\n');
  const result = await convert(input); assert.equal(result.mermaidCount, diagrams.length);
  const html = await readFile(output, 'utf8'); assert.equal(html.split('globalThis["mermaid"] =').length - 1, 1);
  const sources = [...mainBody(html).matchAll(/<pre class="diagram-source"><code>([\s\S]*?)<\/code><\/pre>/g)].map(match => match[1]);
  assert.deepEqual(sources, diagrams.map(code => code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')));
  assert(html.includes(`<script>${mermaid}</script>`), 'verified Mermaid bytes are embedded unchanged');
  assert(html.indexOf('globalThis["mermaid"] =') < html.indexOf('function createDiagramViewer()'), 'library precedes application code');
  assert.doesNotMatch(html, /<!--mdh-mermaid-/);
});

test('post-inserted Mermaid preserves embedded images and runs before a custom after-body fragment', { skip: !mermaid }, async t => {
  const { dir, input, output } = await fixture(t, '# 図と画像\n\n![ローカル画像](image.svg)\n\n```mermaid\nflowchart LR\nA --> B\n```\n');
  await writeFile(path.join(dir, 'image.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="blue"/></svg>');
  const afterBodyFile = path.join(dir, 'after.html');
  await writeFile(afterBodyFile, '<script>globalThis.customAfter = typeof globalThis.mermaid;</script>');
  await convert(input, output, { afterBodyFile });
  const html = await readFile(output, 'utf8');
  assert(html.includes(`<script>${mermaid}</script>`));
  assert(html.indexOf('globalThis["mermaid"] =') < html.indexOf('globalThis.customAfter'));
  assert(/data:image\/svg\+xml|<svg\b/.test(html), 'local image remains embedded');
  assert.doesNotMatch(html, /src="image\.svg"|<!--mdh-mermaid-/);
});