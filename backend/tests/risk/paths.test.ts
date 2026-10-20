import { describe, expect, it } from 'vitest';
import { isTestPath, pathWords, skipReason } from '../../src/risk/paths';

describe('pathWords', () => {
  it('splits on separators and camelCase', () => {
    expect(pathWords('src/authService/LoginForm.tsx')).toEqual(['src', 'auth', 'service', 'login', 'form', 'tsx']);
  });
});

describe('isTestPath', () => {
  it.each(['src/foo.test.ts', 'src/foo.spec.tsx', 'tests/unit/foo.py', 'pkg/foo_test.go', 'test_api.py', 'src/__tests__/a.js', 'FooTest.java'])(
    'treats %s as a test',
    (p) => expect(isTestPath(p)).toBe(true),
  );
  it.each(['src/testing-library.ts', 'src/contest.ts', 'docs/latest.md'])('does not treat %s as a test', (p) =>
    expect(isTestPath(p)).toBe(false),
  );
});

describe('skipReason', () => {
  it.each([
    ['package-lock.json', 'lockfile'],
    ['web/yarn.lock', 'lockfile'],
    ['go.sum', 'lockfile'],
    ['src/__snapshots__/a.test.ts.snap', 'snapshot'],
    ['vendor/github.com/x/y.go', 'vendored'],
    ['public/app.min.js', 'generated'],
    ['api/user.pb.go', 'generated'],
    ['dist/index.js', 'generated'],
  ] as const)('%s is %s', (path, reason) => expect(skipReason(path)).toBe(reason));

  it('leaves normal source alone', () => {
    expect(skipReason('src/build/config.ts')).toBeNull();
    expect(skipReason('package.json')).toBeNull();
  });
});
