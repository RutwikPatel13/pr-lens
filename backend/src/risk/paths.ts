import type { SkipReason } from '@pr-lens/shared';

// "src/auth/LoginForm.tsx" -> ["src", "auth", "login", "form", "tsx"]
export function pathWords(path: string): string[] {
  return path
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter((w) => w !== '')
    .map((w) => w.toLowerCase());
}

export function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

export function hasAnyWord(path: string, words: ReadonlySet<string>): boolean {
  return pathWords(path).some((w) => words.has(w));
}

export function isTestPath(path: string): boolean {
  const name = basename(path);
  return (
    /(^|\/)(tests?|__tests__|specs?)\//i.test(path) ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(name) ||
    /_test\.(go|py|rb)$/.test(name) ||
    /^test_.*\.py$/.test(name) ||
    /_spec\.rb$/.test(name) ||
    /Tests?\.(java|kt|cs)$/.test(name)
  );
}

const LOCKFILES = new Set([
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
  'bun.lock',
  'Cargo.lock',
  'poetry.lock',
  'Pipfile.lock',
  'uv.lock',
  'Gemfile.lock',
  'composer.lock',
  'go.sum',
  'mix.lock',
  'Podfile.lock',
  'flake.lock',
]);

export function skipReason(path: string): SkipReason | null {
  const name = basename(path);
  if (LOCKFILES.has(name)) return 'lockfile';
  if (/\.snap$/.test(name) || /(^|\/)__snapshots__\//.test(path)) return 'snapshot';
  if (/(^|\/)(vendor|node_modules|third_party)\//.test(path)) return 'vendored';
  if (
    /\.min\.(js|css)$/.test(name) ||
    /\.(js|css)\.map$/.test(name) ||
    /\.generated\./.test(name) ||
    /\.pb\.go$/.test(name) ||
    /_pb2(_grpc)?\.py$/.test(name) ||
    /(^|\/)(dist|__generated__)\//.test(path)
  ) {
    return 'generated';
  }
  return null;
}
