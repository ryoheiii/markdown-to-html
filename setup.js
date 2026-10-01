// Download only at setup time. No third-party code is stored in Git.
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import dependencies from './dependencies.json' with { type: 'json' };

const directory = new URL(`./.cache/mermaid-${dependencies.version}/`, import.meta.url);
const hash = data => createHash('sha256').update(data).digest('hex');

async function obtain(name, source, expected) {
  const target = new URL(name, directory);
  try {
    const cached = await readFile(target);
    if (hash(cached) === expected) return cached;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const response = await fetch(`https://cdn.jsdelivr.net/npm/${source}`, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`${source}: HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (hash(data) !== expected) throw new Error(`取得ファイルのSHA-256が一致しません: ${source}`);
  const temp = new URL(`${name}.tmp`, directory);
  await writeFile(temp, data);
  await rename(temp, target);
  return data;
}

// Read the raw user value: keep other entries, %VARIABLES% and the registry type.
export function windowsPathScript(action, bin) {
  const quote = value => "'" + value.replaceAll("'", "''") + "'";
  return String.raw`
$ErrorActionPreference = 'Stop'
$target = ${quote(bin)}
$action = ${quote(action)}
$key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment', $true)
try {
  $old = $key.GetValue('Path', $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
  $kind = [Microsoft.Win32.RegistryValueKind]::ExpandString
  if ($null -ne $old) {
    $kind = $key.GetValueKind('Path')
    if ($kind -notin @('String', 'ExpandString')) { throw 'User Path is not a string.' }
  }
  function Normalize([string] $entry) {
    [Environment]::ExpandEnvironmentVariables($entry.Trim().Trim('"')).Replace('/', '\').TrimEnd('\')
  }
  $entries = @()
  if ($null -ne $old -and $old -ne '') { $entries = @($old.Split(';')) }
  $matchingEntries = @($entries | Where-Object { (Normalize $_) -ieq (Normalize $target) })
  if ($action -eq 'add') {
    if ($matchingEntries.Count -gt 0) { Write-Output 'Already in user PATH.'; return }
    $new = (@($target) + $entries) -join ';'
  } else {
    if ($matchingEntries.Count -eq 0) { Write-Output 'Already absent from user PATH.'; return }
    $new = (@($entries | Where-Object { (Normalize $_) -ine (Normalize $target) })) -join ';'
  }
  $key.SetValue('Path', $new, $kind)
} finally { if ($key) { $key.Dispose() } }
Write-Output 'User PATH updated.'
try {
  if (-not ('Mdh.Native' -as [type])) { Add-Type -Namespace Mdh -Name Native -MemberDefinition '[System.Runtime.InteropServices.DllImport("user32.dll", CharSet = System.Runtime.InteropServices.CharSet.Unicode)] public static extern System.IntPtr SendMessageTimeout(System.IntPtr hwnd, uint msg, System.UIntPtr wParam, string lParam, uint flags, uint timeout, out System.UIntPtr result);' }
  $result = [UIntPtr]::Zero
  [void][Mdh.Native]::SendMessageTimeout([IntPtr]0xffff, 0x1a, [UIntPtr]::Zero, 'Environment', 2, 5000, [ref]$result)
} catch { Write-Warning 'PATH saved. Sign out and back in if new terminals do not pick it up.' }
`;
}

export async function main(args = process.argv.slice(2)) {
  try {
    if (args.length) {
      if (args.length !== 1 || !['--add-path', '--remove-path'].includes(args[0])) throw new Error('使い方: node setup.js [--add-path | --remove-path]');
      if (process.platform !== 'win32') throw new Error('PATH管理コマンドはWindows専用です。UbuntuではREADMEの ~/.bashrc の手順を使ってください。');
      const bin = fileURLToPath(new URL('./bin', import.meta.url));
      if (bin.includes(';')) throw new Error('セミコロンを含む場所はPATHへ登録できません。clone先を移動してください。');
      const script = windowsPathScript(args[0] === '--add-path' ? 'add' : 'remove', bin);
      try {
        execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { stdio: 'inherit', windowsHide: true });
      } catch { throw new Error('ユーザーPATHを変更できませんでした。上記のPowerShellエラーを確認してください。'); }
      console.log('端末・Windows Terminal・VS Codeを終了して開き直してください。反映されなければサインアウトして再ログインしてください。');
      return;
    }
    await mkdir(new URL('licenses/', directory), { recursive: true });
    await obtain('mermaid.min.js', `mermaid@${dependencies.version}/dist/mermaid.min.js`, dependencies.sha256);
    let notices = `Mermaid ${dependencies.version} and bundled dependencies\n`;
    notices += 'Unmodified official full IIFE. License sources pinned from its source map.\n';
    notices += 'ELK source (EPL-2.0): https://github.com/kieler/elkjs/tree/v0.9.3\nhttps://github.com/eclipse/elk\n';
    for (const [source, expected] of Object.entries(dependencies.licenses)) {
      const data = await obtain(`licenses/${expected}.txt`, source, expected);
      notices += `\n--- ${source} ---\n${data.toString('utf8')}\n`;
    }
    await writeFile(new URL('licenses.txt.tmp', directory), notices);
    await rename(new URL('licenses.txt.tmp', directory), new URL('licenses.txt', directory));
    console.log(`Mermaid ${dependencies.version}: ready (${fileURLToPath(directory)})`);
    const bin = fileURLToPath(new URL('./bin', import.meta.url));
    if (process.platform === 'win32') {
      console.log('恒久設定: node setup.js --add-path（解除: node setup.js --remove-path）');
    } else {
      const quoted = "'" + bin.replaceAll("'", "'\\''") + "'";
      console.log(`恒久設定: ~/.bashrc の末尾に次の行を追加:\nexport PATH=${quoted}:"$PATH"`);
    }
    console.log('新しい端末を開き、mdh --doctor を実行してください。詳しくはREADMEの「導入」を参照。');
  } catch (error) {
    console.error(`setup: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await main();
