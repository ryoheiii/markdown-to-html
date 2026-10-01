import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
export const cli = path.resolve('src/cli.js');
export async function temporary(fn) {
  const directory = await mkdtemp(path.join(tmpdir(), 'mdh-test-'));
  try { return await fn(directory); } finally { await rm(directory, { force: true, recursive: true }); }
}
export function command(exe, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { ...options, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', x => stdout += x); child.stderr.on('data', x => stderr += x);
    child.on('error', reject); child.on('close', code => resolve({ code, stdout, stderr }));
  });
}
export const mdh = (args, opts) => command(process.execPath, [cli, ...args], opts);
