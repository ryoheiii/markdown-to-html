import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, cp, chmod, symlink, readlink, lstat } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { resource } from '../src/environment.js';

const ubuntu = { skip: process.platform !== 'linux' };
const success = result => { assert.equal(result.status, 0, result.stderr + result.stdout); return result; };
const absent = filename => assert.rejects(lstat(filename), { code: 'ENOENT' });

async function executable(filename, code) {
  await writeFile(filename, code); await chmod(filename, 0o755);
}

// Fake HTTPS downloads of tiny, executable archives; never install into real HOME.
async function fixture(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'mdh-ubuntu-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const checkout = path.join(dir, "配置 日本語 O'Brien & (mdh)"), home = path.join(dir, 'home'), tools = path.join(dir, 'tools');
  await mkdir(checkout); await mkdir(home); await mkdir(tools);
  for (const name of ['setup.sh', 'setup.js', 'LICENSE', 'package.json', 'dependencies.json', 'src', 'assets', 'bin']) {
    await cp(resource(name), path.join(checkout, name), { recursive: true });
  }
  await writeFile(path.join(checkout, 'setup.sh'), (await readFile(path.join(checkout, 'setup.sh'), 'utf8')).replaceAll('\r\n', '\n'));
  for (const name of ['bash', 'cat', 'dirname', 'readlink', 'mkdir', 'mktemp', 'mv', 'rm', 'tar', 'chmod', 'grep', 'sed', 'ln', 'cp', 'xz', 'gzip']) {
    const found = success(spawnSync('/bin/sh', ['-c', `command -v ${name}`], { encoding: 'utf8' })).stdout.trim();
    await symlink(found, path.join(tools, name));
  }
  await executable(path.join(tools, 'uname'), '#!/bin/sh\nif [ "$1" = "-s" ]; then echo Linux; else echo "${MDH_TEST_ARCH:-x86_64}"; fi\n');
  const nodeCode = '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "${MDH_TEST_NODE_VERSION:-v24.21.0}"; else exec "$MDH_TEST_REAL_NODE" "$@"; fi\n';
  const pandocCode = '#!/bin/sh\nprintf "pandoc %s\\n" "${MDH_TEST_PANDOC_VERSION:-3.8.1}"\n';
  for (const [name, code, suffix] of [['node', nodeCode, 'xz'], ['pandoc', pandocCode, 'gz']]) {
    const parent = path.join(dir, `archive-${name}`), binary = path.join(parent, 'distribution/bin');
    await mkdir(binary, { recursive: true }); await executable(path.join(binary, name), code);
    success(spawnSync('tar', ['-c', suffix === 'xz' ? '-J' : '-z', '-f', path.join(dir, `${name}.tar.${suffix}`), '-C', parent, 'distribution'], { encoding: 'utf8' }));
  }
  await executable(path.join(tools, 'curl'), `#!/bin/sh
output=''
url=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    --output) output=$2; shift 2 ;;
    --proxy|--noproxy|-x) echo 'Inherited proxy settings must not be overridden' >&2; exit 98 ;;
    --proto|--proto-redir|--connect-timeout|--max-time) shift 2 ;;
    --*) shift ;;
    *) url=$1; shift ;;
  esac
done
printf '%s\\n' "https_proxy=\${https_proxy-}" "HTTPS_PROXY=\${HTTPS_PROXY-}" "http_proxy=\${http_proxy-}" "HTTP_PROXY=\${HTTP_PROXY-}" "all_proxy=\${all_proxy-}" "ALL_PROXY=\${ALL_PROXY-}" "no_proxy=\${no_proxy-}" "NO_PROXY=\${NO_PROXY-}" >> "$MDH_TEST_PROXY_LOG"
printf '%s\\n' "$url" >> "$MDH_TEST_CURL_LOG"
if [ "\${MDH_TEST_CURL_FAIL:-0}" = 1 ]; then printf partial > "$output"; exit 22; fi
case "$url" in
  https://nodejs.org/*.tar.xz) cp "$MDH_TEST_ARCHIVES/node.tar.xz" "$output" ;;
  https://github.com/jgm/pandoc/*.tar.gz) cp "$MDH_TEST_ARCHIVES/pandoc.tar.gz" "$output" ;;
  *) exit 99 ;;
esac
`);
  const localBin = path.join(home, '.local/bin'), downloads = path.join(home, '.local/downloads');
  const env = { ...process.env, HOME: home, PATH: tools, MDH_TEST_REAL_NODE: process.execPath,
    MDH_TEST_ARCHIVES: dir, MDH_TEST_CURL_LOG: path.join(dir, 'curl.log'), MDH_TEST_PROXY_LOG: path.join(dir, 'proxy.log') };
  // Clear external test/version overrides so tests do not depend on the caller.
  for (const key of ['MDH_NODE_VERSION', 'MDH_PANDOC_VERSION', 'MDH_TEST_CURL_FAIL', 'MDH_TEST_ARCH', 'MDH_TEST_NODE_VERSION', 'MDH_TEST_PANDOC_VERSION', 'NODE_OPTIONS',
    'https_proxy', 'HTTPS_PROXY', 'http_proxy', 'HTTP_PROXY', 'all_proxy', 'ALL_PROXY', 'no_proxy', 'NO_PROXY']) delete env[key];
  const shell = (args = [], overrides = {}, filename = path.join(checkout, 'setup.sh')) =>
    spawnSync('/bin/bash', [filename, ...args], { cwd: dir, env: { ...env, ...overrides }, encoding: 'utf8' });
  const js = (args, overrides = {}) => spawnSync(process.execPath, [path.join(checkout, 'setup.js'), ...args], { cwd: dir, env: { ...env, ...overrides }, encoding: 'utf8' });
  return { dir, checkout, home, tools, localBin, downloads, env, shell, js, nodeCode, pandocCode };
}

test('Ubuntu bootstrap validates arguments without Node.js and preserves profiles', ubuntu, async t => {
  const f = await fixture(t);
  for (const args of [['--help'], ['-h']]) assert.match(success(f.shell(args)).stdout, /--install-node.*--remove-node/);
  for (const args of [['--bad'], ['--install-node', '--add-path']]) assert.equal(f.shell(args).status, 2);
  assert.match(f.shell().stderr, /先に bash setup.sh --install-node/);
  assert.notEqual(f.shell(['--install-node'], { HOME: '/' }).status, 0);
  for (const name of ['.bashrc', '.zshrc', '.profile']) await writeFile(path.join(f.home, name), '# untouched\n');
  for (const option of ['--remove-node', '--remove-pandoc', '--remove-path']) success(f.shell([option]));
  await absent(f.localBin); await absent(path.join(f.dir, 'curl.log'));
  for (const name of ['.bashrc', '.zshrc', '.profile']) assert.equal(await readFile(path.join(f.home, name), 'utf8'), '# untouched\n');
});

test('Ubuntu bootstrap installs both runtimes, shares JS flags, and removes only owned artifacts', ubuntu, async t => {
  const f = await fixture(t);
  const entry = path.join(f.checkout, 'bin/mdh');
  await writeFile(entry, (await readFile(entry, 'utf8')).replace(/\r?\n/g, '\r\n')); await chmod(entry, 0o640);
  assert.match(success(f.shell(['--install-node'])).stdout, /登録しました/);
  assert.match(success(f.js(['--install-pandoc'])).stdout, /登録しました/);
  const nodeDir = path.join(f.downloads, 'node-v24.21.0-linux-x64'), pandocDir = path.join(f.downloads, 'pandoc-3.8.1-linux-amd64');
  assert.equal(await readlink(path.join(f.localBin, 'node')), path.join(nodeDir, 'bin/node'));
  assert.equal(await readlink(path.join(f.localBin, 'pandoc')), path.join(pandocDir, 'bin/pandoc'));
  for (const option of ['--install-node', '--install-pandoc']) assert.match(success(f.shell([option])).stdout, /導入を省略/);
  const downloads = (await readFile(path.join(f.dir, 'curl.log'), 'utf8')).trim().split('\n');
  assert.equal(downloads.length, 2); assert(downloads.every(url => url.startsWith('https://')));
  const alias = path.join(f.dir, 'checkout alias'); await symlink(f.checkout, alias);
  success(f.shell(['--add-path'], {}, path.join(alias, 'setup.sh')));
  assert.match(success(f.js(['--add-path'])).stdout, /すでに登録済み/);
  assert.equal(await readlink(path.join(f.localBin, 'mdh')), entry);
  assert(!(await readFile(entry, 'utf8')).includes('\r'));
  const env = { ...f.env, PATH: f.localBin + ':' + f.tools };
  const version = success(spawnSync('mdh', ['--version'], { env, cwd: f.dir, encoding: 'utf8' }));
  assert.equal(version.stdout.trim(), '0.2.0');
  const doctor = success(spawnSync('mdh', ['--doctor'], { env, cwd: f.dir, encoding: 'utf8' }));
  assert.match(doctor.stdout, /Node: OK/); assert.match(doctor.stdout, /Pandoc: OK/);
  await writeFile(path.join(f.localBin, 'keep-tool'), 'untouched');
  await writeFile(path.join(f.downloads, 'keep-download'), 'untouched');
  success(f.js(['--remove-path'])); success(f.js(['--remove-pandoc']));
  success(f.shell(['--remove-node']));
  for (const name of ['node', 'pandoc', 'mdh']) await absent(path.join(f.localBin, name));
  for (const filename of [nodeDir, nodeDir + '.tar.xz', pandocDir, pandocDir + '.tar.gz']) await absent(filename);
  // These commands must still work after Node.js has been removed.
  for (const option of ['--remove-node', '--remove-pandoc', '--remove-path']) success(f.shell([option]));
  assert.equal(await readFile(path.join(f.localBin, 'keep-tool'), 'utf8'), 'untouched');
  assert.equal(await readFile(path.join(f.downloads, 'keep-download'), 'utf8'), 'untouched');
  assert((await lstat(entry)).isFile()); assert((await lstat(process.execPath)).isFile());
});

test('Ubuntu uses existing compatible and future runtimes without downloading or managing them', ubuntu, async t => {
  const f = await fixture(t);
  await executable(path.join(f.tools, 'node'), f.nodeCode);
  await executable(path.join(f.tools, 'pandoc'), f.pandocCode);
  for (const [nodeVersion, pandocVersion] of [['v20.20.0', '3.1.3'], ['v26.0.0', '4.0']]) {
    for (const option of ['--install-node', '--install-pandoc']) {
      assert.match(success(f.shell([option], { MDH_TEST_NODE_VERSION: nodeVersion, MDH_TEST_PANDOC_VERSION: pandocVersion })).stdout, /導入を省略/);
    }
  }
  success(f.shell(['--remove-node'])); success(f.shell(['--remove-pandoc']));
  await absent(f.downloads); await absent(path.join(f.dir, 'curl.log'));
  assert.equal(await readFile(path.join(f.tools, 'node'), 'utf8'), f.nodeCode);
  assert.equal(await readFile(path.join(f.tools, 'pandoc'), 'utf8'), f.pandocCode);
});

test('Ubuntu runtime downloads inherit proxy environment and bypass settings through shell and JS launchers', ubuntu, async t => {
  const keys = ['https_proxy', 'HTTPS_PROXY', 'http_proxy', 'HTTP_PROXY', 'all_proxy', 'ALL_PROXY', 'no_proxy', 'NO_PROXY'];
  for (const overrides of [
    { https_proxy: 'http://lower-proxy.invalid:8080', http_proxy: 'http://lower-proxy.invalid:8080', no_proxy: 'localhost,.example.test' },
    { HTTPS_PROXY: 'http://upper-proxy.invalid:8080', HTTP_PROXY: 'http://upper-proxy.invalid:8080', NO_PROXY: '*' },
    { https_proxy: 'http://lower-proxy.invalid:8080', HTTPS_PROXY: 'http://upper-proxy.invalid:8080', all_proxy: 'http://all-proxy.invalid:8080', ALL_PROXY: 'http://other-proxy.invalid:8080', no_proxy: '*', NO_PROXY: '.example.test' },
    {},
  ]) {
    const f = await fixture(t);
    success(f.shell(['--install-node'], overrides));
    success(f.js(['--install-pandoc'], overrides));
    const urls = (await readFile(path.join(f.dir, 'curl.log'), 'utf8')).trim().split('\n');
    assert.equal(urls.length, 2);
    assert.match(urls[0], /^https:\/\/nodejs\.org\//);
    assert.match(urls[1], /^https:\/\/github\.com\/jgm\/pandoc\//);
    const expected = keys.map(key => `${key}=${overrides[key] || ''}\n`).join('');
    assert.equal(await readFile(path.join(f.dir, 'proxy.log'), 'utf8'), expected + expected);
  }
});

test('Ubuntu rejects overwrites and removal of regular files, foreign links and unowned distributions', ubuntu, async t => {
  const f = await fixture(t); await mkdir(f.localBin, { recursive: true });
  for (const [name, install, remove] of [['node', '--install-node', '--remove-node'], ['pandoc', '--install-pandoc', '--remove-pandoc'], ['mdh', '--add-path', '--remove-path']]) {
    const link = path.join(f.localBin, name), other = path.join(f.dir, `other-${name}`);
    await writeFile(link, 'regular file');
    assert.notEqual(f.shell([install]).status, 0); assert.notEqual(f.shell([remove]).status, 0);
    assert.equal(await readFile(link, 'utf8'), 'regular file'); await rm(link);
    await writeFile(other, 'other tool'); await symlink(other, link);
    assert.notEqual(f.shell([install]).status, 0); assert.notEqual(f.shell([remove]).status, 0);
    assert.equal(await readlink(link), other); await rm(link);
  }
  const unowned = path.join(f.downloads, 'node-v24.21.0-linux-x64');
  await mkdir(path.join(unowned, 'bin'), { recursive: true }); await executable(path.join(unowned, 'bin/node'), f.nodeCode);
  await symlink(path.join(unowned, 'bin/node'), path.join(f.localBin, 'node'));
  assert.match(f.shell(['--remove-node']).stderr, /導入したものではない/);
  await rm(path.join(f.localBin, 'node'));
  assert.match(f.shell(['--install-node']).stderr, /展開先は上書きしません/);
  assert((await lstat(unowned)).isDirectory()); await absent(path.join(f.dir, 'curl.log'));
  const otherArchive = path.join(f.downloads, 'pandoc-3.8.1-linux-amd64.tar.gz');
  await writeFile(otherArchive, 'previous archive');
  assert.match(f.shell(['--install-pandoc']).stderr, /取得ファイルは上書きしません/);
  assert.equal(await readFile(otherArchive, 'utf8'), 'previous archive');
});

test('Ubuntu failed downloads leave existing commands and downloads intact without temporary files', ubuntu, async t => {
  const f = await fixture(t); await mkdir(f.downloads, { recursive: true });
  await writeFile(path.join(f.downloads, 'keep'), 'untouched');
  for (const option of ['--install-node', '--install-pandoc']) assert.notEqual(f.shell([option], { MDH_TEST_CURL_FAIL: '1' }).status, 0);
  assert.deepEqual(await readdir(f.downloads), ['keep']); await absent(f.localBin);
  assert.notEqual(f.shell(['--install-node'], { MDH_NODE_VERSION: '18.20.8' }).status, 0);
  assert.notEqual(f.shell(['--install-pandoc'], { MDH_PANDOC_VERSION: '../bad' }).status, 0);
});

test('Ubuntu ARM64 selects the matching official distributions', ubuntu, async t => {
  const f = await fixture(t);
  success(f.shell(['--install-node'], { MDH_TEST_ARCH: 'aarch64' }));
  success(f.shell(['--install-pandoc'], { MDH_TEST_ARCH: 'aarch64' }));
  const urls = await readFile(path.join(f.dir, 'curl.log'), 'utf8');
  assert.match(urls, /node-v24\.21\.0-linux-arm64\.tar\.xz/);
  assert.match(urls, /pandoc-3\.8\.1-linux-arm64\.tar\.gz/);
  success(f.shell(['--remove-node'])); success(f.shell(['--remove-pandoc']));
});