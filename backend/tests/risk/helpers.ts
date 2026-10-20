import type { PrFile } from '@pr-lens/shared';

export function file(path: string, patch: string | null = '@@ -0,0 +1 @@\n+x', overrides: Partial<PrFile> = {}): PrFile {
  return { path, previousPath: null, status: 'modified', additions: 1, deletions: 0, patch, ...overrides };
}

// Builds a single-hunk patch: lines starting with "+", "-" or " ".
export function patch(oldStart: number, newStart: number, lines: string[]): string {
  return [`@@ -${oldStart},1 +${newStart},1 @@`, ...lines].join('\n');
}
