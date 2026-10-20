// Zips extension/dist for the Chrome Web Store, without the manifest's "key".
// The key pins the extension ID for local, unpacked builds; the store assigns its own ID to an
// upload, and its dashboard then shows a public key that can replace ours (one ID everywhere).
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'dist');
const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));
delete manifest.key;

const staging = mkdtempSync(join(tmpdir(), 'pr-lens-package-'));
try {
  cpSync(dist, staging, { recursive: true });
  writeFileSync(join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2));
  const zip = join(root, `pr-lens-${manifest.version}.zip`);
  rmSync(zip, { force: true });
  execFileSync('zip', ['-r', '-X', '-q', zip, '.'], { cwd: staging });
  console.log(`Wrote ${zip} (manifest without "key", version ${manifest.version})`);
} finally {
  rmSync(staging, { recursive: true, force: true });
}
