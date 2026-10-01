import { spawn } from 'node:child_process';

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
