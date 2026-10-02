#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { convert } from './convert.js';
import { resource, checkNode, dependencies } from './environment.js';
import { isMainModule } from './entry-point.js';
import { checkAssets, readMermaid } from './assets.js';
import { checkPandoc, createPandoc } from './pandoc.js';
import { openHtml } from './open.js';

const help = `mdh — Markdown → 単一オフライン HTML
Usage: mdh <input.md> [-o output.html] [--open] [--no-number-sections]
       mdh --doctor | --help | --version
Node.js 20.20.0 以降 / Pandoc 3.1.3 以降。
--number-sections / --no-number-sections: 見出し・目次の章番号を有効 / 無効化。
  既定は章番号付き・目次 H1〜H4。Markdown 原本は変更しません。
--css PATH / --after-body PATH: 信頼できるカスタム CSS / HTML 断片。`;
const version = JSON.parse(await readFile(resource('package.json'), 'utf8')).version;

function usageError(message) { const error = new Error(message); error.exitCode = 2; return error; }

export function parseArguments(args) {
  const positional = [];
  const options = { numberSections: true };
  let output, open = false, action, literal = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (!literal && arg === '--') { literal = true; continue; }
    if (!literal && ['--help', '-h', '--version', '--doctor'].includes(arg)) { action = arg === '-h' ? '--help' : arg; continue; }
    if (!literal && arg === '--number-sections') { options.numberSections = true; continue; }
    if (!literal && arg === '--no-number-sections') { options.numberSections = false; continue; }
    if (!literal && arg === '--container') { options.container = true; continue; }
    if (!literal && arg === '--open') { open = true; continue; }
    if (!literal && ['-o', '--output', '--css', '--after-body'].includes(arg)) {
      const key = ['-o', '--output'].includes(arg) ? 'output' : arg === '--css' ? 'cssFile' : 'afterBodyFile';
      const value = args[++index];
      if (!value || value.startsWith('-') || (key === 'output' ? output !== undefined : options[key] !== undefined)) throw usageError(`${arg} にはパスを1つ指定してください。`);
      if (key === 'output') output = value; else options[key] = value;
      continue;
    }
    if (!literal && arg.startsWith('-')) throw usageError(`不明なオプション: ${arg}`);
    positional.push(arg);
  }
  if (action) {
    if (positional.length || output !== undefined || open || options.cssFile || options.afterBodyFile) throw usageError('診断・ヘルプと変換引数は同時に指定できません。');
    return { action, options };
  }
  if (!positional[0] || positional.length !== 1) throw usageError(help);
  return { input: positional[0], output, options, open };
}

export async function main(args = process.argv.slice(2)) {
  const parsed = parseArguments(args);
  if (parsed.action === '--help') { console.log(help); return; }
  if (parsed.action === '--version') { console.log(version); return; }
  if (parsed.action === '--doctor') {
    console.log(`mdh ${version} / ${process.platform} ${process.arch}\nNode: ${process.version} (${process.execPath})\nInstall: ${resource('')}`);
    for (const [label, check] of [
      ['Node', checkNode], ['Pandoc', async () => checkPandoc((await createPandoc(parsed.options)).run)], ['Assets', checkAssets],
    ]) {
      try { console.log(`${label}: OK ${await check()}`); } catch (error) { console.error(`${label}: ERROR ${error.message}`); process.exitCode = 1; }
    }
    try { await readMermaid(); console.log(`Mermaid: OK ${dependencies.version}`); }
    catch { console.log('Mermaid: 未セットアップ（図を使う場合のみ node setup.js が必要）'); }
    return;
  }
  checkNode();
  const result = await convert(parsed.input, parsed.output, parsed.options);
  for (const warning of result.warnings) console.error(`mdh: warning: ${warning}`);
  console.log(result.output);
  if (parsed.open) {
    try {
      await openHtml(result.output);
    } catch (error) { console.error(`mdh: warning: ブラウザーを開けませんでした: ${error.message}\n生成済み: ${result.output}`); }
  }
}

if (isMainModule(import.meta.url)) {
  main().catch(error => { console.error(`mdh: error: ${error.message}`); process.exitCode = error.exitCode || 1; });
}