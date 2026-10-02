import { realpath } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { run } from './pandoc.js';

// ShellExecute via Start-Process expects a native filename, not an encoded file URL.
export const windowsOpenScript = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
try {
  Start-Process -FilePath $env:MDH_OPEN_FILE -ErrorAction Stop
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
`;

export async function openHtml(filename, { platform = process.platform, runner = run } = {}) {
  if (platform === 'win32') {
    // Resolve OneDrive directory aliases; pass Unicode unescaped in the environment.
    const target = await realpath(filename);
    await runner('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(windowsOpenScript, 'utf16le').toString('base64')], {
      env: { ...process.env, MDH_OPEN_FILE: target },
    });
  } else {
    await runner('xdg-open', [pathToFileURL(filename).href]);
  }
}