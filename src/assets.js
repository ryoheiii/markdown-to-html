import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const resource = name => path.join(root, name);
export const escapeHTML = value => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const utf8 = buffer => new TextDecoder('utf-8', { fatal: true }).decode(buffer);

export async function checkAssets() {
  for (const name of ['assets/template.html', 'assets/theme.css', 'assets/syntax.theme', 'assets/app.js', 'vendor/mermaid.min.js', 'vendor/mermaid-notices.txt', 'LICENSE', 'THIRD_PARTY_NOTICES']) {
    if (!(await stat(resource(name))).isFile()) throw new Error(`同梱資産がありません: ${name}。配布アーカイブから再導入してください。`);
  }
  const manifest = JSON.parse(await readFile(resource('vendor/manifest.json'), 'utf8'));
  for (const [file, hash] of Object.entries(manifest.sha256)) {
    if (createHash('sha256').update(await readFile(resource(`vendor/${file}`))).digest('hex') !== hash) throw new Error(`同梱資産の整合性エラー: ${file}。再導入してください。`);
  }
  return `Mermaid ${manifest.version}`;
}

export async function localImage(target, directory) {
  // Native absolute paths are allowed; URL schemes (including data/file) are not input assets.
  if (target.startsWith('//') || (!path.isAbsolute(target) && /^[a-z][a-z0-9+.-]*:/i.test(target))) throw new Error(`外部画像・URL画像は非対応です: ${target}`);
  let decoded;
  try { decoded = decodeURIComponent(target); } catch { throw new Error(`画像パスのURLエンコードが不正です: ${target}`); }
  if (decoded.startsWith('//') || (!path.isAbsolute(decoded) && /^[a-z][a-z0-9+.-]*:/i.test(decoded))) throw new Error(`外部画像は非対応です: ${target}`);
  const filename = path.resolve(directory, decoded);
  const extension = path.extname(filename).toLowerCase();
  if (!['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(extension)) throw new Error(`非対応の画像形式です: ${target}`);
  const actual = await realpath(filename);
  if (!(await stat(actual)).isFile()) throw new Error(`画像がファイルではありません: ${target}`);
  const bytes = await readFile(actual);
  if (extension === '.svg') {
    const text = utf8(bytes);
    // This is a conservative dependency check, not an SVG sanitizer.
    if (/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet|<(?:[\w.-]+:)?(?:script|foreignObject)\b|\bon\w+\s*=|@import|@font-face/i.test(text)
      || [...text.matchAll(/\b(?:[\w.-]+:)?href\s*=\s*(["'])(.*?)\1/gis)].some(m => !m[2].startsWith('#'))
      || [...text.matchAll(/url\s*\((.*?)\)/gis)].some(m => !/^\s*["']?#[-\w.:]+["']?\s*$/.test(m[1]))
      || /\\[0-9a-f]{1,6}|\\(?:u|x)|\b(?:src)\s*=/i.test(text)) {
      throw new Error(`SVGの外部参照・スクリプト・埋め込み文書は非対応です: ${target}。依存のないSVGにしてください。`);
    }
  }
  // Pandoc does the actual resource embedding from the resolved native path.
  return actual;
}
