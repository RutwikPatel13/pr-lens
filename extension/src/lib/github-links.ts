import type { LineRange, PrRef } from '@pr-lens/shared';

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// GitHub's own anchor format on the Files tab: diff-<sha256(path)> for the file,
// plus R<n> / L<n> for a line on the new / old side.
export async function diffAnchor(path: string, lines: LineRange | null): Promise<string> {
  const file = `diff-${await sha256Hex(path)}`;
  if (lines === null) return file;
  return `${file}${lines.side === 'RIGHT' ? 'R' : 'L'}${lines.start}`;
}

export function filesTabUrl(pr: PrRef): string {
  return `https://github.com/${pr.owner}/${pr.repo}/pull/${pr.number}/files`;
}
