import { describe, expect, it } from 'vitest';
import { parsePatch } from '../../src/risk/patch';

describe('parsePatch', () => {
  it('numbers added, removed and context lines per side', () => {
    const lines = parsePatch(['@@ -10,3 +10,3 @@ function foo() {', ' a', '-b', '+B', ' c'].join('\n'));
    expect(lines).toEqual([
      { kind: 'context', text: 'a', oldLine: 10, newLine: 10 },
      { kind: 'del', text: 'b', oldLine: 11, newLine: null },
      { kind: 'add', text: 'B', oldLine: null, newLine: 11 },
      { kind: 'context', text: 'c', oldLine: 12, newLine: 12 },
    ]);
  });

  it('restarts numbering at each hunk', () => {
    const lines = parsePatch(['@@ -1,1 +1,2 @@', ' a', '+b', '@@ -50,1 +51,1 @@', '-y', '+z'].join('\n'));
    expect(lines.map((l) => [l.kind, l.oldLine, l.newLine])).toEqual([
      ['context', 1, 1],
      ['add', null, 2],
      ['del', 50, null],
      ['add', null, 51],
    ]);
  });

  it('handles hunk headers without counts and ignores the no-newline marker', () => {
    const lines = parsePatch(['@@ -0,0 +1 @@', '+only line', '\\ No newline at end of file'].join('\n'));
    expect(lines).toEqual([{ kind: 'add', text: 'only line', oldLine: null, newLine: 1 }]);
  });
});
