#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { convert, resource, checkAssets, run, checkPandoc } from './convert.js';

const help = `mdh — Markdown → 単一オフラインHTML
Usage: mdh <input.md> [-o output.html] [--open]
       mdh --doctor | --help | --version
相対画像は入力のフォルダー基準、-oは現在の作業フォルダー基準です。
CLIの成功はHTML生成の成功です。Mermaidは閲覧時に描画・エラー表示します。`;
const version = JSON.parse(await readFile(resource('package.json'), 'utf8')).version;
function checkNode() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major !== 24 || minor < 21) throw new Error(`Node.js 24.21.0以上、25未満が必要です（現在 ${process.version}）。https://nodejs.org/`);
}
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) { console.log(help); return; }
  if (args.length === 1 && args[0] === '--version') { console.log(version); return; }
  if (args.length === 1 && args[0] === '--doctor') {
    console.log(`mdh ${version} / ${process.platform} ${process.arch}\nNode: ${process.version} (${process.execPath})\nInstall: ${resource('')}`);
    for (const [label, check] of [['Node', checkNode], ['Pandoc', checkPandoc], ['Assets', checkAssets]]) {
      try { console.log(`${label}: OK ${await check() || ''}`); } catch (e) { console.error(`${label}: ERROR ${e.message}`); process.exitCode = 1; }
    }
    return;
  }
  checkNode();
  let input, output, open = false, literal = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (!literal && arg === '--') { literal = true; continue; }
    if (!literal && arg === '--open') { open = true; continue; }
    if (!literal && ['-o', '--output'].includes(arg)) {
      if (output !== undefined || !args[index + 1] || args[index + 1].startsWith('-')) throw new Error('-oには出力パスを1つ指定してください。');
      output = args[++index]; continue;
    }
    if (!literal && arg.startsWith('-')) throw new Error(`不明なオプション: ${arg}`);
    if (input !== undefined) throw new Error('入力は1ファイルだけ指定してください。');
    input = arg;
  }
  if (!input) throw new Error(help);
  const result = await convert(input, output);
  for (const warning of result.warnings) console.error(`mdh: warning: ${warning}`);
  console.log(result.output);
  if (open) {
    try {
      const url = pathToFileURL(result.output).href;
      if (process.platform === 'win32') await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Start-Process -FilePath $env:MDH_OPEN_URL -ErrorAction Stop'], { env: { ...process.env, MDH_OPEN_URL: url } });
      else await run('xdg-open', [url]);
    } catch (e) { console.error(`mdh: warning: ブラウザーを開けませんでした: ${e.message}\n生成済み: ${result.output}`); }
  }
}
main().catch(e => { console.error(`mdh: error: ${e.message}`); process.exitCode = 1; });
