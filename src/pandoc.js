import { spawn } from 'node:child_process';
import path from 'node:path';
import { root, pandocImage, parsePandocVersion } from './environment.js';

export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout = (stdout + chunk).slice(-65536); });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-65536); });
    child.on('error', error => reject(new Error(`${command}: ${error.message}${error.code === 'ENOENT' ? ' — PATH を確認してください。' : ''}`)));
    child.on('close', (code, signal) => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`${command} failed (${signal || code}): ${stderr.trim() || stdout.trim()}`)));
  });
}

export async function checkPandoc(runner = args => run('pandoc', args)) {
  const { stdout } = await runner(['--version']);
  parsePandocVersion(stdout);
  return stdout.trim().split(/\r?\n/)[0];
}

export async function createPandoc({ container = false, cwd, temp } = {}) {
  if (!container) return { run: args => run('pandoc', args, { cwd }) };
  if (process.platform !== 'linux') throw new Error('--container は Ubuntu / WSL 内から実行してください。');
  let runtime = process.env.CONTAINER_RUNTIME;
  if (runtime && !['docker', 'podman'].includes(runtime)) throw new Error('CONTAINER_RUNTIME は docker または podman を指定してください。');
  if (!runtime) {
    for (const candidate of ['docker', 'podman']) {
      try { await run(candidate, ['--version']); runtime = candidate; break; } catch { /* try the next runtime */ }
    }
  }
  if (!runtime) throw new Error('Docker または Podman が必要です。');
  const mounts = temp ? [[temp, '/work'], [cwd, '/data'], [root, '/mdh']] : [];
  const mapped = filename => {
    for (const [host, guest] of mounts) {
      const relative = path.relative(host, filename);
      if (relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))) {
        return guest + (relative ? '/' + relative.split(path.sep).join('/') : '');
      }
    }
    throw new Error(`コンテナから参照できないパスです: ${filename}`);
  };
  const args = ['run', '--rm', '--user', `${process.getuid()}:${process.getgid()}`, '--env', 'LANG=C.UTF-8', '--env', 'LC_ALL=C.UTF-8'];
  for (const [host, guest] of mounts) args.push('--volume', `${host}:${guest}${guest === '/work' ? '' : ':ro'}`);
  if (temp) args.push('--workdir', '/data');
  args.push(pandocImage);
  return {
    run: pandocArgs => run(runtime, [...args, ...pandocArgs.map(arg => path.isAbsolute(arg) ? mapped(arg) : arg)], { cwd }),
  };
}