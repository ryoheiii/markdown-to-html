import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, copyFile, readdir, link, chmod, cp, rename } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { convert } from '../src/convert.js';
import { temporary, mdh, command, cli } from './helpers.js';

test('clone-local entry works from another cwd; cached setup needs no network', () => temporary(async dir => {
  const checkout=path.join(dir,'clone 日本語 & (test)'); await mkdir(checkout);
  for(const name of ['src','assets','bin','.cache','package.json','dependencies.json','LICENSE','setup.js']) await cp(path.resolve(name),path.join(checkout,name),{recursive:true});
  const setupURL=pathToFileURL(path.join(checkout,'setup.js')).href;
  const setup=await command(process.execPath,['--input-type=module','-e',`globalThis.fetch=()=>{throw Error('unexpected network')}; await import(${JSON.stringify(setupURL)});`],{cwd:dir});
  assert.equal(setup.code,0,setup.stderr);
  const input=path.join(dir,'資料 & (入力).md'), output=path.join(dir,'結果.html'); await writeFile(input,'# cloneから実行');
  const env={...process.env,MDH_BIN:path.join(checkout,'bin/mdh.cmd'),MDH_INPUT:input,MDH_OUTPUT:output};
  for(const key of Object.keys(env)) if(key.toLowerCase()==='path') delete env[key];
  env.PATH=path.dirname(process.execPath)+path.delimiter+(process.env.PATH||process.env.Path);
  let result;
  if(process.platform==='win32') result=await command('powershell.exe',['-NoProfile','-NonInteractive','-Command','& $env:MDH_BIN $env:MDH_INPUT -o $env:MDH_OUTPUT; exit $LASTEXITCODE'],{cwd:dir,env});
  else result=await command(path.join(checkout,'bin/mdh'),[input,'-o',output],{cwd:dir,env});
  assert.equal(result.code,0,result.stderr); assert.match(await readFile(output,'utf8'),/cloneから実行/);
  const previous=await readFile(output,'utf8');
  await rename(path.join(checkout,'.cache'),path.join(checkout,'hidden-cache'));
  const missing=await command(process.execPath,[path.join(checkout,'src/cli.js'),input,'-o',output],{cwd:dir,env});
  assert.equal(missing.code,1); assert.match(missing.stderr,/node setup.js/);
  assert.equal(await readFile(output,'utf8'),previous);
}));

test('UTF-8 BOM / CRLF, Japanese + space + symbols paths, input-relative images, cwd-relative output', () => temporary(async dir => {
  const source = path.join(dir, '日本語 資料 & (a) # %'); await mkdir(source);
  await copyFile('tests/fixtures/image.svg', path.join(source, '図 #%.svg'));
  const input = path.join(source, '設計.md');
  await writeFile(input, '\ufeff## 日本語\r\n\r\n![図](%E5%9B%B3%20%23%25.svg)\r\n\r\n$a$\r\n');
  const run = await mdh([input, '-o', '出力/out.html'], { cwd: dir });
  assert.equal(run.code, 0, run.stderr);
  const html = await readFile(path.join(dir, '出力/out.html'), 'utf8');
  assert.match(html, /data:image\/svg\+xml/); assert.match(html, /日本語/); assert.match(html, /\$a\$/);
  assert(!html.includes('globalThis.__esbuild_esm_mermaid')); assert(!html.includes('math inline'));
}));

test('full fixture; one vendor script; math/raw HTML/nested and escaped fences', () => temporary(async dir => {
  const output = path.join(dir, 'out.html');
  const result = await convert('tests/fixtures/sample.md', output);
  assert.equal(result.mermaidCount, 8);
  const html = await readFile(output, 'utf8');
  assert.equal(html.split('globalThis["mermaid"] =').length - 1, 1);
  assert.match(html, /&lt;script&gt;window.unwanted/);
  assert.match(html, /\$\$c=d\$\$/);
  assert(html.length > 5_000_000);
}));

for (const target of ['https://example.com/image.png', '//example.com/image.png', 'data:image/png;base64,AAAA', 'missing.png', 'bad.bmp']) {
  test(`reject ${target} preserving old output`, () => temporary(async dir => {
    const input = path.join(dir, 'in.md'), output = path.join(dir, 'in.html');
    await writeFile(input, `![x](${target})`); await writeFile(output, 'previous');
    await assert.rejects(convert(input));
    assert.equal(await readFile(output, 'utf8'), 'previous');
    assert.deepEqual((await readdir(dir)).sort(), ['in.html', 'in.md']);
  }));
}
test('reject SVG dependencies before embedding', () => temporary(async dir => {
  const input = path.join(dir, 'in.md'); await writeFile(input, '![x](bad.svg)');
  for (const content of ['<image href="https://example.com/a.png"/>', '<style>@import "x.css";</style>', '<script>alert(1)</script>', '<text style="font-family:x"/><style>@font-face{src:url(x)}</style>']) {
    await writeFile(path.join(dir, 'bad.svg'), `<svg xmlns="http://www.w3.org/2000/svg">${content}</svg>`);
    await assert.rejects(convert(input), /SVG/);
  }
}));
test('invalid UTF-8 and same input/output (including hard link) fail without overwrite', () => temporary(async dir => {
  const input = path.join(dir, 'in.md'); await writeFile(input, Buffer.from([0xff, 0xfe]));
  await assert.rejects(convert(input), /encoded data/);
  await writeFile(input, '# keep');
  await assert.rejects(convert(input, input), /同じ/);
  const alias = path.join(dir, 'alias.html'); await link(input, alias);
  await assert.rejects(convert(input, alias), /同じ/);
  assert.equal(await readFile(input, 'utf8'), '# keep');
}));
test('CLI diagnostics and missing Pandoc leave old output intact', () => temporary(async dir => {
  assert.equal((await mdh(['--help'])).code, 0);
  assert.equal((await mdh(['--version'])).stdout.trim(), '0.1.0');
  assert.equal((await mdh(['--doctor'])).code, 0);
  for (const args of [[], ['a.md', 'b.md'], ['--bad'], ['a.md', '-o']]) assert.equal((await mdh(args)).code, 1);
  const input = path.join(dir, 'in.md'); await writeFile(input, 'hello'); await writeFile(path.join(dir, 'in.html'), 'previous');
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.toLowerCase() === 'path') delete env[key];
  env.PATH = dir;
  const result = await mdh([input], { env });
  assert.equal(result.code, 1); assert.match(result.stderr, /PATH/);
  assert.equal(await readFile(path.join(dir, 'in.html'), 'utf8'), 'previous');
}));
test('--open failure is a warning after successful generation', () => temporary(async dir => {
  const located=await command(process.platform==='win32'?'where.exe':'which',['pandoc']); assert.equal(located.code,0,located.stderr);
  const pandoc=located.stdout.trim().split(/\r?\n/)[0];
  const env={...process.env}; for(const key of Object.keys(env)) if(key.toLowerCase()==='path') delete env[key]; env.PATH=path.dirname(pandoc);
  const input=path.join(dir,'in.md'); await writeFile(input,'# hello');
  const result=await mdh([input,'--open'],{env}); assert.equal(result.code,0,result.stderr);
  assert.match(result.stderr,/warning/); assert.match(await readFile(path.join(dir,'in.html'),'utf8'),/hello/);
}));
test('output failures preserve input and clean temp directory', () => temporary(async dir => {
  const input = path.join(dir, 'in.md'); await writeFile(input, '# hello');
  const output = path.join(dir, 'directory.html'); await mkdir(output);
  await assert.rejects(convert(input, output));
  assert.equal(await readFile(input, 'utf8'), '# hello');
  assert(!(await readdir(dir)).some(name => name.startsWith('.mdh-')));
}));
test('read-only destination permissions (unprivileged Unix)', { skip: process.platform === 'win32' || process.getuid?.() === 0 }, () => temporary(async dir => {
  const input = path.join(dir, 'in.md'); await writeFile(input, '# hello');
  const locked = path.join(dir, 'locked'); await mkdir(locked); await writeFile(path.join(locked, 'out.html'), 'previous');
  await chmod(locked, 0o500);
  try { await assert.rejects(convert(input, path.join(locked, 'out.html'))); assert.equal(await readFile(path.join(locked, 'out.html'), 'utf8'), 'previous'); }
  finally { await chmod(locked, 0o700); }
}));
test('unreadable source preserves old HTML (unprivileged Unix)', {skip:process.platform==='win32'||process.getuid?.()===0},()=>temporary(async dir=>{
  const input=path.join(dir,'in.md'),output=path.join(dir,'in.html');await writeFile(input,'# private');await writeFile(output,'previous');await chmod(input,0);
  try {await assert.rejects(convert(input),/EACCES/);assert.equal(await readFile(output,'utf8'),'previous');}
  finally {await chmod(input,0o600);}
}));

test('Windows locked existing output is preserved', {skip:process.platform !== 'win32'}, () => temporary(async dir => {
  const input=path.join(dir,'in.md'), output=path.join(dir,'in.html');
  await writeFile(input,'# hello'); await writeFile(output,'previous');
  const env={...process.env,MDH_TEST_NODE:process.execPath,MDH_TEST_CLI:cli,MDH_TEST_INPUT:input,MDH_TEST_OUTPUT:output};
  const result=await command('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$handle = [IO.File]::Open($env:MDH_TEST_OUTPUT, 'Open', 'ReadWrite', 'None'); try { & $env:MDH_TEST_NODE $env:MDH_TEST_CLI $env:MDH_TEST_INPUT; $resultCode = $LASTEXITCODE } finally { $handle.Dispose() }; exit $resultCode"],{env});
  assert.equal(result.code,1,result.stderr); assert.match(result.stderr,/mdh: error/);
  assert.equal(await readFile(output,'utf8'),'previous'); assert(!(await readdir(dir)).some(name=>name.startsWith('.mdh-')));
}));

test('Pandoc writer failure preserves old HTML and removes temporary output', {skip:process.platform === 'win32'}, () => temporary(async dir => {
  const located=await command('which',['pandoc']); assert.equal(located.code,0);
  const fake=path.join(dir,'pandoc');
  const script=`#!${process.execPath}\nimport {spawnSync} from 'node:child_process';\nif(process.argv.includes('html5')) {console.error('simulated writer failure');process.exit(7);}\nconst result=spawnSync(${JSON.stringify(located.stdout.trim())},process.argv.slice(2),{stdio:'inherit'});process.exit(result.status);\n`;
  await writeFile(fake,script,{mode:0o755});
  const input=path.join(dir,'in.md'), output=path.join(dir,'in.html'); await writeFile(input,'# hello'); await writeFile(output,'previous');
  const result=await mdh([input],{env:{...process.env,PATH:dir+path.delimiter+process.env.PATH}});
  assert.equal(result.code,1); assert.match(result.stderr,/simulated writer failure/);
  assert.equal(await readFile(output,'utf8'),'previous'); assert(!(await readdir(dir)).some(name=>name.startsWith('.mdh-')));
}));
