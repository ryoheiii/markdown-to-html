import { readFile, writeFile, stat, chmod } from 'node:fs/promises';
import path from 'node:path';
import { resource } from './environment.js';
import { run } from './pandoc.js';

function validate(action, bin) {
  if (!['add', 'remove'].includes(action)) throw new Error('PATH 操作は add / remove を指定してください。');
  if (!path.isAbsolute(bin) || /[\r\n\0]/.test(bin)) throw new Error('PATH 登録先には改行のない絶対パスが必要です。');
}

// Preserve raw user PATH entries, %VARIABLES%, empty entries and registry type.
export function windowsPathScript(action, bin, { registryKey = 'Environment', notify = true } = {}) {
  validate(action, bin);
  if (/[;"]/.test(bin)) throw new Error('セミコロン・二重引用符を含む場所は PATH に登録できません。');
  const quote = value => "'" + value.replaceAll("'", "''") + "'";
  return String.raw`
$ErrorActionPreference = 'Stop'
$target = ${quote(bin)}
$action = ${quote(action)}
$key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey(${quote(registryKey)}, $true)
if ($null -eq $key -and $action -eq 'add') {
  $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey(${quote(registryKey)})
}
$changed = $false
$present = $false
try {
  if ($null -ne $key) {
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
    if ($action -eq 'add' -and $matchingEntries.Count -eq 0) {
      $new = (@($target) + $entries) -join ';'
      $changed = $true
    } elseif ($action -eq 'remove' -and $matchingEntries.Count -gt 0) {
      $new = (@($entries | Where-Object { (Normalize $_) -ine (Normalize $target) })) -join ';'
      $changed = $true
    }
    if ($changed) { $key.SetValue('Path', $new, $kind) }
    $saved = $key.GetValue('Path', $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
    $present = @(([string]$saved).Split(';') | Where-Object { (Normalize $_) -ieq (Normalize $target) }).Count -gt 0
    if ($present -ne ($action -eq 'add')) { throw 'User PATH verification failed: target state does not match the requested action.' }
    if ($changed -and ($saved -cne $new -or $key.GetValueKind('Path') -ne $kind)) {
      throw 'User PATH verification failed: saved value or registry type does not match.'
    }
  }
} finally { if ($key) { $key.Dispose() } }
$notified = $false
${notify ? String.raw`
try {
  Add-Type -Namespace Mdh -Name Native -MemberDefinition '[System.Runtime.InteropServices.DllImport("user32.dll", CharSet = System.Runtime.InteropServices.CharSet.Unicode)] public static extern System.IntPtr SendMessageTimeout(System.IntPtr hwnd, uint msg, System.UIntPtr wParam, string lParam, uint flags, uint timeout, out System.UIntPtr result);'
  $result = [UIntPtr]::Zero
  $notified = [Mdh.Native]::SendMessageTimeout([IntPtr]0xffff, 0x1a, [UIntPtr]::Zero, 'Environment', 2, 5000, [ref]$result) -ne [IntPtr]::Zero
} catch { $notified = $false }
` : ''}
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[pscustomobject]@{ target = $target; present = $present; changed = $changed; notified = $notified } | ConvertTo-Json -Compress
`;
}

// Prepare the executable without inspecting or editing shell configuration.
export async function prepareCommand(bin = resource('bin')) {
  if (process.platform !== 'linux') return;
  const entry = path.join(bin, 'mdh'), info = await stat(entry);
  if (!info.isFile()) throw new Error(`mdh の入口がファイルではありません: ${entry}`);
  // Windows checkouts may use CRLF; Linux shebangs must end with LF.
  const source = await readFile(entry, 'utf8');
  if (source.includes('\r\n')) await writeFile(entry, source.replaceAll('\r\n', '\n'));
  await chmod(entry, info.mode | 0o100);
}

export function pathInstructions(bin = resource('bin')) {
  if (process.platform === 'win32') return 'PATH 登録: node setup.js --add-path（解除: node setup.js --remove-path）';
  return [
    'mdh 登録: node setup.js --add-path（解除: node setup.js --remove-path）',
    `登録元: ${path.join(bin, 'mdh')} -> ~/.local/bin/mdh`,
    'PATH に追加するのは ~/.local/bin だけです。登録済みなら PATH の変更は不要です。',
  ].join('\n');
}

export async function managePath(action, { bin = resource('bin'), runner = run } = {}) {
  validate(action, bin);
  if (process.platform === 'linux') {
    const result = await runner('bash', [resource('setup.sh'), action === 'add' ? '--add-path' : '--remove-path']);
    return result.stdout.trim();
  }
  if (process.platform !== 'win32') {
    throw new Error('mdh の自動登録・解除は Windows / Ubuntu 専用です。');
  }
  const script = windowsPathScript(action, bin);
  const result = await runner('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')]);
  let status;
  try { status = JSON.parse(result.stdout.trim()); }
  catch { throw new Error('PATH の処理結果を確認できません。PowerShell の出力を確認してください。'); }
  if (!status || status.target !== bin || status.present !== (action === 'add') || typeof status.changed !== 'boolean' || typeof status.notified !== 'boolean') {
    throw new Error('PATH の保存状態が要求した処理と一致しません。');
  }
  const message = status.changed
    ? (status.present ? '追加しました。' : '解除しました。')
    : (status.present ? 'すでに登録済みです（変更なし）。' : 'すでに未登録です（変更なし）。');
  return [
    message,
    `対象: ${bin}`,
    `ユーザー PATH（保存済み）: ${status.present ? '登録済み' : '未登録'}（確認済み）`,
    'システム PATH と起動済みの端末の PATH は変更しません。',
    'VS Code・端末アプリケーションの全ウィンドウを終了して開き直してください。ターミナルのタブだけの再作成では反映されない場合があります。',
    ...(status.notified ? [] : ['Windows への環境変数変更通知が完了しませんでした。']),
    '反映されなければサインアウトして再ログインしてください。',
  ].join('\n');
}