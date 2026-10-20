import type { CustomRule } from '@pr-lens/shared';
import { evaluateCustomRules, globToRegExp, pathMatches, patternError } from '@pr-lens/shared/custom-rules';
import { describe, expect, it } from 'vitest';
import { file, patch } from '../risk/helpers';

function rule(overrides: Partial<CustomRule>): CustomRule {
  return { id: 'r1', name: 'My rule', kind: 'path', pattern: '**', regex: false, severity: 'high', explanation: 'Look here.', enabled: true, ...overrides };
}

describe('pathMatches', () => {
  it.each([
    ['**/billing/**', 'billing/charge.ts', true],
    ['**/billing/**', 'app/billing/invoices/pdf.rb', true],
    ['**/billing/**', 'app/billing.rb', false],
    ['src/*.ts', 'src/a.ts', true],
    ['src/*.ts', 'src/lib/a.ts', false],
    ['src/**/*.ts', 'src/a.ts', true],
    ['src/**/*.ts', 'src/lib/deep/a.ts', true],
    ['*.sql', 'db/migrations/001.sql', true],
    ['**/*api_key*', 'app/models/user_api_key.rb', true],
    ['**/*api_key*', 'spec/requests/user_api_keys_controller_spec.rb', true],
    ['config/?.yml', 'config/a.yml', true],
    ['config/?.yml', 'config/ab.yml', false],
    ['/docs/**', 'docs/readme.md', true],
  ])('%s against %s is %s', (glob, path, expected) => {
    expect(pathMatches(glob, path)).toBe(expected);
  });

  it('treats regex characters in globs literally', () => {
    expect(globToRegExp('a.b(c)+').test('a.b(c)+')).toBe(true);
    expect(globToRegExp('a.b').test('axb')).toBe(false);
  });
});

describe('patternError', () => {
  it('rejects empty patterns and broken regular expressions', () => {
    expect(patternError({ kind: 'path', pattern: ' ', regex: false })).toBe('Enter a pattern.');
    expect(patternError({ kind: 'added', pattern: 'console\\.(log', regex: true })).toMatch(/^Not a valid regular expression/);
    expect(patternError({ kind: 'added', pattern: 'console\\.(log)', regex: true })).toBeNull();
    expect(patternError({ kind: 'added', pattern: '(', regex: false })).toBeNull();
  });
});

describe('evaluateCustomRules', () => {
  const files = [
    file('app/billing/charge.rb', patch(10, 10, [' def charge', '-  old', '+  # TODO: retry', '+  amount * 100', ' end'])),
    file('package-lock.json', patch(1, 1, ['+ "TODO": 1'])),
    file('docs/readme.md', null),
  ];
  const skip = new Map([['package-lock.json', 'lockfile' as const]]);

  it('flags path matches at the first changed line, or the whole file without a patch', () => {
    const flags = evaluateCustomRules(files, [rule({ pattern: '**/billing/**' }), rule({ id: 'r2', name: 'Docs', pattern: 'docs/**' })], skip);
    expect(flags.map((f) => [f.filePath, f.lines, f.label, f.source, f.category])).toEqual([
      ['app/billing/charge.rb', { side: 'RIGHT', start: 11, end: 11 }, 'My rule', 'custom', 'custom'],
      ['docs/readme.md', null, 'Docs', 'custom', 'custom'],
    ]);
  });

  it('flags added lines containing the text, skipping deprioritized files', () => {
    const flags = evaluateCustomRules(files, [rule({ kind: 'added', pattern: 'TODO', severity: 'low' })], skip);
    expect(flags.map((f) => [f.filePath, f.lines?.start, f.severity])).toEqual([['app/billing/charge.rb', 11, 'low']]);
  });

  it('supports regular expressions and removed lines', () => {
    const removed = evaluateCustomRules(files, [rule({ kind: 'removed', pattern: '^\\s+old$', regex: true })], skip);
    expect(removed.map((f) => f.lines)).toEqual([{ side: 'LEFT', start: 11, end: 11 }]);
  });

  it('ignores rules that are off or have a broken pattern', () => {
    expect(evaluateCustomRules(files, [rule({ enabled: false }), rule({ kind: 'added', pattern: '(', regex: true })], skip)).toEqual([]);
  });

  it('gives flags unique ids and a default explanation', () => {
    const flags = evaluateCustomRules(files, [rule({ pattern: '**', explanation: '  ' })], skip);
    expect(new Set(flags.map((f) => f.id)).size).toBe(flags.length);
    expect(flags[0]?.explanation).toBe('Matches your rule "My rule".');
  });
});
