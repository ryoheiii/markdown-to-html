import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, readdir, mkdir, stat, lstat, readlink, chmod, cp, symlink } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { setup, main, parseSetupArguments, downloadAsset, setupLicenses } from '../setup.js';
import { readMermaid, mermaidAsset, sha256 } from '../src/assets.js';
import { resource, dependencies } from '../src/environment.js';
import { isMainModule } from '../src/entry-point.js';
import { prepareCommand, pathInstructions, managePath, windowsPathScript } from '../src/path-setup.js';

let vendor;
try { vendor = await readMermaid(); } catch { /* optional cache */ }

async function directory(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'mdh-setup-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('setup uses native fetch with a timeout and propagates download failures', async t => {
  const response = { ok: true };
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, dependencies.url);
    assert(options.signal instanceof AbortSignal);
    assert.equal(options.signal.aborted, false);
    return response;
  });
  assert.equal(await downloadAsset(dependencies.url), response);
  t.mock.restoreAll();
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('network unavailable'); });
  const dir = await directory(t), target = path.join(dir, 'mermaid.min.js');
  await writeFile(target, 'previous');
  await assert.rejects(setup({ target }), /network unavailable/);
  assert.equal(await readFile(target, 'utf8'), 'previous');
  assert.deepEqual(await readdir(dir), ['mermaid.min.js']);
});

test('downloaded Mermaid and third-party licenses match the manifest and are reused offline', async () => {
  const target = mermaidAsset('mermaid.min.js');
  assert.equal(sha256(await readFile(target)), dependencies.sha256);
  const download = async () => { throw new Error('unexpected network'); };
  assert.equal(await setup({ download }), target);
  await setupLicenses({ download });
  const notices = await readFile(mermaidAsset('licenses.txt'), 'utf8');
  for (const [source, expected] of Object.entries(dependencies.licenses)) {
    assert.equal(sha256(await readFile(mermaidAsset('licenses/' + expected + '.txt'))), expected);
    assert(notices.includes(source));
  }
  for (const text of ['Mermaid', 'dompurify@3.4.12', 'elkjs@0.9.3', 'Eclipse Public License', 'Apache License', 'lodash-es@4.18.1']) assert(notices.includes(text), text);
});

test('download/hash failure preserves previous cache and leaves no temporary files', async t => {
  const dir = await directory(t), target = path.join(dir, 'mermaid.min.js');
  await writeFile(target, 'previous');
  await assert.rejects(setup({ target, download: async () => ({ ok: false, status: 503 }) }), /HTTP 503/);
  await assert.rejects(setup({ target, download: async () => ({ ok: true, arrayBuffer: async () => Buffer.from('wrong') }) }), /SHA-256/);
  assert.equal(await readFile(target, 'utf8'), 'previous'); assert.deepEqual(await readdir(dir), ['mermaid.min.js']);
});
test('PATH setup options are explicit, validated, and independent of Mermaid download', async () => {
  assert.deepEqual(parseSetupArguments([]), {});
  assert.deepEqual(parseSetupArguments(['--add-path']), { action: 'add' });
  assert.deepEqual(parseSetupArguments(['--remove-path']), { action: 'remove' });
  assert.deepEqual(parseSetupArguments(['--help']), { help: true });
  for (const option of ['--install-node', '--remove-node', '--install-pandoc', '--remove-pandoc']) {
    assert.deepEqual(parseSetupArguments([option]), { ubuntuAction: option });
    if (process.platform === 'win32') await assert.rejects(main([option]), /Ubuntu.*専用/);
  }
  for (const args of [['--bad'], ['--add-path', '--remove-path'], ['--add-path', '--shell'], ['--remove-path', '--shell', 'bash'], ['--shell', 'zsh']]) {
    assert.throws(() => parseSetupArguments(args), /使い方/);
  }
  await assert.rejects(main(['--bad']), /使い方/);
});

test('setup and CLI run through directory aliases without executing when imported', async t => {
  const dir = await directory(t), alias = path.join(dir, '別名 OneDrive & (mdh)');
  await symlink(resource(''), alias, process.platform === 'win32' ? 'junction' : 'dir');
  const setupUrl = pathToFileURL(resource('setup.js')).href;
  assert.equal(isMainModule(setupUrl, path.join(alias, 'setup.js')), true);
  assert.equal(isMainModule(pathToFileURL(path.join(alias, 'setup.js')).href, resource('setup.js')), true);
  assert.equal(isMainModule(setupUrl, resource('src/cli.js')), false);
  assert.equal(isMainModule(setupUrl, ''), false);
  assert.equal(isMainModule(setupUrl, path.join(dir, 'missing.js')), false);

  for (const flags of [[], ['--preserve-symlinks-main']]) {
    for (const [entry, expected] of [['setup.js', /使い方: node setup\.js/], ['src/cli.js', /Usage: mdh/]]) {
      for (const filename of [entry, path.join(alias, entry)]) {
        const result = spawnSync(process.execPath, [...flags, filename, '--help'], { cwd: alias, encoding: 'utf8', windowsHide: true });
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, expected);
      }
    }
  }

  const env = { ...process.env, PATH: path.dirname(process.execPath) + path.delimiter + process.env.PATH };
  const launcher = process.platform === 'win32'
    ? spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '& $env:MDH_ALIAS_LAUNCHER --help; exit $LASTEXITCODE'], {
      cwd: alias, env: { ...env, MDH_ALIAS_LAUNCHER: path.join(alias, 'bin/mdh.cmd') }, encoding: 'utf8', windowsHide: true,
    })
    : spawnSync(process.execPath, [path.join(alias, 'bin/mdh'), '--help'], { cwd: alias, env, encoding: 'utf8' });
  assert.equal(launcher.status, 0, launcher.stderr);
  assert.match(launcher.stdout, /Usage: mdh/);

  const importer = path.join(dir, 'import-only.mjs');
  await writeFile(importer, `globalThis.fetch = () => { throw Error('unexpected network'); };\nawait import(${JSON.stringify(pathToFileURL(path.join(alias, 'setup.js')).href)});\nawait import(${JSON.stringify(pathToFileURL(path.join(alias, 'src/cli.js')).href)});\nconsole.log('import-only');\n`);
  const imported = spawnSync(process.execPath, [importer], { cwd: alias, encoding: 'utf8', windowsHide: true });
  assert.equal(imported.status, 0, imported.stderr);
  assert.equal(imported.stdout.trim(), 'import-only');
  assert.equal(imported.stderr, '');
});

test('PATH instructions do not depend on the selected Ubuntu shell', () => {
  const bin = resource('bin'), instructions = pathInstructions(bin);
  if (process.platform === 'win32') assert.match(instructions, /--add-path.*--remove-path/);
  else {
    assert.match(instructions, /node setup\.js --add-path.*--remove-path/);
    assert.match(instructions, /PATH に追加するのは ~\/\.local\/bin だけ/);
    assert(instructions.includes(path.join(bin, 'mdh')));
    assert.doesNotMatch(instructions, /\.bashrc|\.zshrc|--shell/);
  }
});

test('Ubuntu setup and shared mdh flags work offline without editing shell settings', {
  skip: process.platform !== 'linux' || !vendor,
}, async t => {
  const dir = await directory(t), checkout = path.join(dir, "配置 日本語 & (mdh) O'Brien"), home = path.join(dir, 'home');
  await mkdir(checkout); await mkdir(home);
  for (const name of ['src', 'assets', 'bin', 'LICENSE', 'package.json', 'dependencies.json', 'setup.js', 'setup.sh']) await cp(resource(name), path.join(checkout, name), { recursive: true });
  await writeFile(path.join(checkout, 'setup.sh'), (await readFile(path.join(checkout, 'setup.sh'), 'utf8')).replaceAll('\r\n', '\n'));
  const bin = path.join(checkout, 'bin'), entry = path.join(bin, 'mdh');
  await writeFile(entry, (await readFile(entry, 'utf8')).replace(/\r?\n/g, '\r\n')); await chmod(entry, 0o640);
  const cachedVendor = path.join(checkout, '.cache/mermaid-12.0.0/mermaid.min.js');
  await mkdir(path.dirname(cachedVendor), { recursive: true }); await writeFile(cachedVendor, vendor);
  await cp(mermaidAsset('licenses'), path.join(path.dirname(cachedVendor), 'licenses'), { recursive: true });
  const url = pathToFileURL(path.join(checkout, 'setup.js')).href;
  const localBin = path.join(home, '.local/bin');
  const env = { ...process.env, HOME: home, SHELL: '/bin/fish', PATH: localBin + path.delimiter + process.env.PATH };
  const invoke = args => spawnSync(process.execPath, ['--input-type=module', '-e', `globalThis.fetch=()=>{throw Error('unexpected network')}; await (await import(${JSON.stringify(url)})).main(${JSON.stringify(args)});`], { cwd: dir, env, encoding: 'utf8' });
  const original = '# untouched\n';
  for (const name of ['.bashrc', '.zshrc', '.profile']) await writeFile(path.join(home, name), original);
  await mkdir(localBin, { recursive: true });
  await symlink(process.execPath, path.join(localBin, 'node'));
  await writeFile(path.join(localBin, 'keep-tool'), 'untouched');
  for (let index = 0; index < 2; index++) {
    const result = invoke([]); assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /PATH に追加するのは ~\/\.local\/bin だけ/);
  }
  assert.equal((await stat(entry)).mode & 0o777, 0o740);
  assert(!(await readFile(entry, 'utf8')).includes('\r'));
  await assert.rejects(lstat(path.join(localBin, 'mdh')), { code: 'ENOENT' });
  for (let index = 0; index < 2; index++) {
    const result = invoke(['--add-path']); assert.equal(result.status, 0, result.stderr);
  }
  assert.equal(await readlink(path.join(localBin, 'mdh')), entry);
  for (const shell of ['bash', 'zsh']) {
    const located = spawnSync(shell, ['--version'], { encoding: 'utf8' });
    if (located.error?.code === 'ENOENT') { t.diagnostic(`${shell} is not installed; skipped`); continue; }
    const result = spawnSync(shell, ['-c', 'command -v node; command -v mdh; node --version; mdh --version'], { env, cwd: dir, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.stdout.trim().split('\n'), [path.join(localBin, 'node'), path.join(localBin, 'mdh'), process.version, '0.2.0']);
  }
  const doctor = spawnSync('mdh', ['--doctor'], { cwd: dir, env, encoding: 'utf8' });
  assert.equal(doctor.status, 0, doctor.stderr); assert.match(doctor.stdout, /Node: OK/); assert.match(doctor.stdout, /Assets: OK/);
  const input = path.join(dir, '手順.md'), output = path.join(dir, '手順.html'), markdown = '# リンク経由の変換\n';
  await writeFile(input, markdown);
  const converted = spawnSync('mdh', [input], { cwd: dir, env, encoding: 'utf8' });
  assert.equal(converted.status, 0, converted.stderr); assert.equal(converted.stdout.trim(), output);
  assert.match(await readFile(output, 'utf8'), /リンク経由の変換/);
  for (const action of ['--remove-path', '--remove-path']) {
    const result = invoke([action]); assert.equal(result.status, 0, result.stderr);
  }
  await assert.rejects(lstat(path.join(localBin, 'mdh')), { code: 'ENOENT' });
  assert.equal(await readFile(input, 'utf8'), markdown);
  assert.equal(await readFile(cachedVendor, 'utf8'), vendor);
  assert((await stat(entry)).isFile()); assert((await stat(output)).isFile());
  assert.equal(await readFile(path.join(localBin, 'keep-tool'), 'utf8'), 'untouched');
  assert.equal(await readlink(path.join(localBin, 'node')), process.execPath);
  assert((await stat(process.execPath)).isFile());
  for (const name of ['.bashrc', '.zshrc', '.profile']) assert.equal(await readFile(path.join(home, name), 'utf8'), original);
  assert.deepEqual((await readdir(home)).sort(), ['.bashrc', '.local', '.profile', '.zshrc']);
});

test('Ubuntu command preparation rejects directory entry without modifying it', { skip: process.platform !== 'linux' }, async t => {
  const dir = await directory(t); await mkdir(path.join(dir, 'mdh'));
  await assert.rejects(prepareCommand(dir), /ファイルではありません/);
});

test('Windows user PATH registration preserves unrelated entries, raw variables and registry types', {
  skip: process.platform !== 'win32',
}, () => {
  const registryKey = `Software\\mdh-path-test-${process.pid}-${Date.now()}`;
  const bin = "C:\\資料 & (mdh)\\O'Brien\\bin";
  const quote = value => "'" + value.replaceAll("'", "''") + "'";
  const generated = action => `function Invoke-Mdh${action} {\n${windowsPathScript(action, bin, { registryKey, notify: false })}\n}`;
  const script = [
    "$ErrorActionPreference = 'Stop'",
    `$testKey = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey(${quote(registryKey)})`,
    generated('add'), generated('remove'),
    'try {',
    "$original = '%USERPROFILE%\\tools;;C:\\Other;'",
    "$testKey.SetValue('Path', $original, [Microsoft.Win32.RegistryValueKind]::ExpandString)",
    '$firstAdd = Invoke-Mdhadd | ConvertFrom-Json; $repeatAdd = Invoke-Mdhadd | ConvertFrom-Json',
    `if ($firstAdd.target -cne ${quote(bin)} -or !$firstAdd.present -or !$firstAdd.changed -or $firstAdd.notified -or !$repeatAdd.present -or $repeatAdd.changed) { throw 'Incorrect add status' }`,
    "$actual = $testKey.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)",
    `if ($actual -cne (${quote(bin + ';')} + $original)) { throw 'Duplicate add or unrelated entries changed' }`,
    "if ($testKey.GetValueKind('Path') -ne 'ExpandString') { throw 'Value type changed' }",
    '$firstRemove = Invoke-Mdhremove | ConvertFrom-Json; $repeatRemove = Invoke-Mdhremove | ConvertFrom-Json',
    `if ($firstRemove.target -cne ${quote(bin)} -or $firstRemove.present -or !$firstRemove.changed -or $repeatRemove.present -or $repeatRemove.changed) { throw 'Incorrect remove status' }`,
    "if ($testKey.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames) -cne $original) { throw 'Remove changed existing entries' }",
    `$testKey.SetValue('Path', ${quote('"' + bin.toUpperCase().replaceAll('\\', '/') + '/";C:\\Other')}, [Microsoft.Win32.RegistryValueKind]::String)`,
    '$normalizedAdd = Invoke-Mdhadd | ConvertFrom-Json; $normalizedRemove = Invoke-Mdhremove | ConvertFrom-Json',
    "if (!$normalizedAdd.present -or $normalizedAdd.changed -or $normalizedRemove.present -or !$normalizedRemove.changed) { throw 'Incorrect normalized status' }",
    "if ($testKey.GetValue('Path') -cne 'C:\\Other' -or $testKey.GetValueKind('Path') -ne 'String') { throw 'Normalized removal or String type failed' }",
    `$testKey.SetValue('Path', ${quote(bin + ';"' + bin.toUpperCase().replaceAll('\\', '/') + '/";')} + $original, [Microsoft.Win32.RegistryValueKind]::ExpandString)`,
    '$duplicateRemove = Invoke-Mdhremove | ConvertFrom-Json',
    "if ($duplicateRemove.present -or !$duplicateRemove.changed -or $testKey.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames) -cne $original) { throw 'Duplicate removal failed' }",
    "$testKey.DeleteValue('Path')",
    '$absentRemove = Invoke-Mdhremove | ConvertFrom-Json',
    "if ($absentRemove.present -or $absentRemove.changed) { throw 'Incorrect absent PATH status' }",
    'Invoke-Mdhadd | Out-Null; Invoke-Mdhremove | Out-Null',
    "if ($testKey.GetValue('Path') -ne '') { throw 'Absent or empty PATH failed' }",
    '} finally {',
    '$testKey.Dispose()',
    `[Microsoft.Win32.Registry]::CurrentUser.DeleteSubKeyTree(${quote(registryKey)})`,
    '}',
  ].join('\n');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.throws(() => windowsPathScript('add', 'C:\\bad;name\\bin'), /セミコロン/);
});

test('Windows PATH removal reports a missing registry key without creating it', { skip: process.platform !== 'win32' }, () => {
  const registryKey = `Software\\mdh-path-absent-test-${process.pid}-${Date.now()}`, bin = resource('bin');
  const script = windowsPathScript('remove', bin, { registryKey, notify: false });
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.deepEqual(JSON.parse(result.stdout.trim()), { target: bin, present: false, changed: false, notified: false });
  const check = spawnSync('reg.exe', ['query', `HKCU\\${registryKey}`], { encoding: 'utf8', windowsHide: true });
  assert.notEqual(check.status, 0, 'Removal must not create an absent registry key');
});

test('Windows PATH messages distinguish saved state from the running terminal and reject unverified results', { skip: process.platform !== 'win32' }, async () => {
  const bin = resource('bin'), originalPath = process.env.PATH;
  for (const [action, changed, expected] of [
    ['add', true, '追加しました。'], ['add', false, 'すでに登録済みです（変更なし）。'],
    ['remove', true, '解除しました。'], ['remove', false, 'すでに未登録です（変更なし）。'],
  ]) {
    const runner = async (command, args) => {
      assert.equal(command, 'powershell.exe'); assert.equal(args[2], '-EncodedCommand');
      return { stdout: JSON.stringify({ target: bin, present: action === 'add', changed, notified: true }), stderr: '' };
    };
    const message = await managePath(action, { bin, runner });
    assert(message.startsWith(expected)); assert(message.includes(`対象: ${bin}`));
    assert(message.includes(`ユーザー PATH（保存済み）: ${action === 'add' ? '登録済み' : '未登録'}（確認済み）`));
    assert.match(message, /起動済みの端末の PATH は変更しません/);
    assert.match(message, /VS Code.*全ウィンドウ.*タブだけ/);
  }
  const status = { target: bin, present: false, changed: true, notified: false };
  const message = await managePath('remove', { bin, runner: async () => ({ stdout: JSON.stringify(status) }) });
  assert.match(message, /通知が完了しませんでした/);
  for (const invalid of [{ ...status, present: true }, { ...status, target: 'wrong' }, { ...status, changed: 'true' }, { ...status, notified: null }, null]) {
    await assert.rejects(managePath('remove', { bin, runner: async () => ({ stdout: JSON.stringify(invalid) }) }), /保存状態/);
  }
  await assert.rejects(managePath('remove', { bin, runner: async () => ({ stdout: 'unexpected output' }) }), /処理結果/);
  await assert.rejects(managePath('remove', { bin, runner: async () => { throw new Error('User PATH verification failed'); } }), /verification failed/);
  assert.equal(process.env.PATH, originalPath);
});

test('verified download is cached; repeated setup does not access the network', { skip: !vendor }, async t => {
  const dir = await directory(t), target = path.join(dir, 'mermaid.min.js');
  await setup({ target, download: async () => ({ ok: true, arrayBuffer: async () => Buffer.from(vendor) }) });
  await setup({ target, download: async () => { throw new Error('unexpected network'); } });
  assert.equal(await readFile(target, 'utf8'), vendor);
});