import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Node resolves ESM URLs through symlinks, but argv[1] can retain an alias.
export function isMainModule(moduleUrl, entry = process.argv[1]) {
  if (!entry) return false;
  try {
    return path.relative(realpathSync(entry), realpathSync(fileURLToPath(moduleUrl))) === '';
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes(error.code)) return false;
    throw error;
  }
}