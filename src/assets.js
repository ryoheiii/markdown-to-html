import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dependencies, resource } from './environment.js';

export const mermaidAsset = name => resource(`.cache/mermaid-${dependencies.version}/${name}`);
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const utf8 = bytes => new TextDecoder('utf-8', { fatal: true }).decode(bytes);
export const escapeHTML = value => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export async function readMermaid() {
  try {
    const bytes = await readFile(mermaidAsset('mermaid.min.js'));
    if (sha256(bytes) !== dependencies.sha256) throw new Error('Mermaid の SHA-256 が一致しません');
    const script = utf8(bytes);
    if (/<\/script/i.test(script)) throw new Error('Mermaid を安全にインライン化できません');
    return script;
  } catch (error) {
    throw new Error(`Mermaid の setup が必要です。プロジェクトで node setup.js を実行してください。(${error.message})`);
  }
}

export async function checkAssets() {
  for (const name of ['assets/template.html', 'assets/theme.css', 'assets/syntax.theme', 'assets/app.js', 'LICENSE']) {
    if (!(await stat(resource(name))).isFile()) throw new Error(`アセットがありません: ${name}`);
  }
  return 'template / CSS / JavaScript / syntax theme';
}
