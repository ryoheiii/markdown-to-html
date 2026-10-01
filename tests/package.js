import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, readdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { command, temporary } from './helpers.js';

const npm = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const root = process.cwd();
await temporary(async dir => {
  const npmEnv = { ...process.env, npm_config_cache: path.join(dir, 'npm-cache') };
  const packed = await command(process.execPath, [npm, 'pack', '--json', '--pack-destination', dir], { env: npmEnv });
  assert.equal(packed.code, 0, packed.stderr);
  const metadata = JSON.parse(packed.stdout)[0];
  const files = metadata.files.map(f => f.path);
  for (const file of ['src/cli.js','assets/template.html','assets/app.js','vendor/mermaid.min.js','vendor/mermaid-notices.txt','LICENSE','THIRD_PARTY_NOTICES']) assert(files.includes(file), file);
  assert(!files.some(f=>f.startsWith('node_modules/') || f.startsWith('.tools/') || f.startsWith('tests/')));
  const prefix = path.join(dir, '独立 install');
  const install = await command(process.execPath, [npm, 'install', '--global', '--prefix', prefix, '--offline', '--ignore-scripts', '--no-audit', '--no-fund', path.join(dir, metadata.filename)], { env: npmEnv });
  assert.equal(install.code, 0, install.stderr);
  const moduleRoot = process.platform === 'win32' ? path.join(prefix,'node_modules') : path.join(prefix,'lib/node_modules');
  const installed = path.join(moduleRoot,'@ryoheiii/mdh/src/cli.js');
  const isolated = path.join(dir, 'input'); await mkdir(isolated);
  await writeFile(path.join(isolated,'sample.md'), '# 配布テスト\n\n```mermaid\nflowchart LR\n A --> B\n```');
  const moved = [];
  const hold = path.join(root, '.test-output', 'package-source-hold'); await mkdir(hold, {recursive:true});
  try {
    // Make original implementation/assets unavailable at their expected paths.
    for (const name of ['src','assets','vendor']) { await rename(path.join(root,name),path.join(hold,name)); moved.push(name); }
    const doctor = await command(process.execPath, [installed, '--doctor'], {cwd:dir}); assert.equal(doctor.code,0,doctor.stderr);
    const result = await command(process.execPath, [installed,path.join(isolated,'sample.md')], {cwd:dir}); assert.equal(result.code,0,result.stderr);
    assert((await readFile(path.join(isolated,'sample.html'),'utf8')).includes('globalThis["mermaid"] ='));
    // Verify the npm bin mapping itself, without composing untrusted shell arguments.
    if (process.platform === 'win32') {
      const env = {...process.env, MDH_PACKAGE_SHIM:path.join(prefix,'mdh.cmd')};
      const bin = await command('powershell.exe',['-NoProfile','-NonInteractive','-Command','& $env:MDH_PACKAGE_SHIM --version; exit $LASTEXITCODE'],{env,cwd:dir});
      assert.equal(bin.code,0,bin.stderr); assert.equal(bin.stdout.trim(),'0.1.0');
      const specialPrefix = path.join(dir, '特殊 install & (test)');
      const specialInstall = await command(process.execPath,[npm,'install','--global','--prefix',specialPrefix,'--offline','--ignore-scripts','--no-audit','--no-fund',path.join(dir,metadata.filename)],{env:npmEnv});
      assert.equal(specialInstall.code,0,specialInstall.stderr);
      const direct = await command(process.execPath,[path.join(specialPrefix,'node_modules/@ryoheiii/mdh/src/cli.js'),'--doctor'],{cwd:dir});
      assert.equal(direct.code,0,direct.stderr);
    } else {
      const bin = await command(path.join(prefix,'bin/mdh'),['--version'],{cwd:dir}); assert.equal(bin.code,0,bin.stderr); assert.equal(bin.stdout.trim(),'0.1.0');
    }
  } finally { for (const name of moved.reverse()) await rename(path.join(hold,name),path.join(root,name)); }
  console.log(`Archive installation and npm bin, original src/assets/vendor absent: PASS (${metadata.size} packed bytes)`);
});
