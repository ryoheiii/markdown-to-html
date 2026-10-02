import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const resource = name => path.join(root, name);
// JSON import attributes and Node 22/24-only APIs are intentionally not required.
export const dependencies = JSON.parse(await readFile(resource('dependencies.json'), 'utf8'));
export const nodeMinimum = '20.20.0';
export const pandocMinimum = '3.1.3';
export const pandocImage = 'pandoc/core:3.1.13-ubuntu@sha256:9fd0ece86509b45dc843c9ad77b79732f071b86fda09251da9e7d0104d878b82';

export function atLeast(version, minimum) {
  const parse = value => /^v?(\d+)\.(\d+)(?:\.(\d+))?(?:[.-]|$)/.exec(value);
  const actual = parse(version), required = parse(minimum);
  if (!actual || !required) return false;
  for (let index = 1; index <= 3; index++) {
    const delta = Number(actual[index] || 0) - Number(required[index] || 0);
    if (delta) return delta > 0;
  }
  return true;
}

export function checkNode(version = process.versions.node) {
  if (!atLeast(version, nodeMinimum)) throw new Error(`Node.js ${nodeMinimum} 以降が必要です（現在 ${version}）。`);
  return version;
}

export function parsePandocVersion(stdout) {
  const match = /^pandoc (\d+\.\d+(?:\.\d+)?(?:\.\d+)?)/m.exec(stdout);
  if (!match || !atLeast(match[1], pandocMinimum)) {
    throw new Error(`Pandoc ${pandocMinimum} 以降が必要です（${stdout.trim().split(/\r?\n/)[0] || '版を取得できません'}）。`);
  }
  return match[1];
}

export function highlightingArgs(version, theme) {
  return [atLeast(version, '3.8.0') ? '--syntax-highlighting' : '--highlight-style', theme];
}