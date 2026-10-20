import { describe, expect, it } from 'vitest';
import { numberPatch, planChunks } from '../../src/llm/chunking';
import { analyzeRisk } from '../../src/risk/engine';
import { patch } from '../risk/helpers';
import { file, pr } from './fakes';

const bigPatch = (lines: number) => patch(1, 1, Array.from({ length: lines }, (_, i) => `+const line${i} = ${i};`));

describe('numberPatch', () => {
  it('prefixes each line with its reference and records the valid ones', () => {
    const { text, lineRefs, truncated } = numberPatch(['@@ -4,2 +4,2 @@', ' keep', '-old', '+new'].join('\n'), 1000);
    expect(text.split('\n')).toEqual(['R4      keep', 'L5    - old', 'R5    + new']);
    expect([...lineRefs]).toEqual(['R4', 'L5', 'R5']);
    expect(truncated).toBe(false);
  });

  it('marks the gap between hunks', () => {
    const { text } = numberPatch(['@@ -1,1 +1,1 @@', ' a', '@@ -40,1 +40,1 @@', ' b'].join('\n'), 1000);
    expect(text.split('\n')).toEqual(['R1      a', '...', 'R40     b']);
  });

  it('cuts at the character limit and only records lines that made it in', () => {
    const { text, lineRefs, truncated } = numberPatch(bigPatch(100), 200);
    expect(truncated).toBe(true);
    expect(text.length).toBeLessThanOrEqual(200);
    expect(lineRefs.has('R1')).toBe(true);
    expect(lineRefs.has('R100')).toBe(false);
  });
});

describe('planChunks', () => {
  const limits = { maxFileChars: 1_000, maxChunkChars: 2_000, maxChunks: 2 };

  it('leaves out skipped files and files without a patch, and says why', () => {
    const data = pr([file('package-lock.json'), file('logo.png', null), file('src/a.ts')]);
    const plan = planChunks(data, analyzeRisk(data.files), limits);
    expect(plan.chunks.flat().map((f) => f.path)).toEqual(['src/a.ts']);
    expect(plan.notRead).toEqual([
      { path: 'package-lock.json', reason: 'lockfile' },
      { path: 'logo.png', reason: 'no_patch' },
    ]);
  });

  it('keeps every chunk within budget and never makes more than maxChunks', () => {
    const files = Array.from({ length: 12 }, (_, i) => file(`src/f${i}.ts`, bigPatch(15)));
    const data = pr(files);
    const plan = planChunks(data, analyzeRisk(files), limits);
    expect(plan.chunks.length).toBeLessThanOrEqual(2);
    for (const chunk of plan.chunks) {
      const size = chunk.reduce((n, f) => n + f.header.length + f.numberedDiff.length, 0);
      expect(size).toBeLessThanOrEqual(limits.maxChunkChars);
    }
    const read = plan.chunks.flat().length;
    expect(read + plan.notRead.length).toBe(12);
    expect(plan.notRead.every((n) => n.reason === 'over_budget')).toBe(true);
  });

  it('fills the budget with flagged files first, then source, then tests and docs', () => {
    const files = [
      file('README.md', bigPatch(25)),
      file('src/cart.test.ts', bigPatch(25)),
      file('src/cart.ts', bigPatch(25)),
      file('src/billing/charge.ts', bigPatch(25)),
    ];
    const data = pr(files);
    const plan = planChunks(data, analyzeRisk(files), { maxFileChars: 1_000, maxChunkChars: 1_100, maxChunks: 2 });
    expect(plan.chunks.flat().map((f) => f.path).sort()).toEqual(['src/billing/charge.ts', 'src/cart.ts']);
    expect(plan.notRead.map((n) => n.path)).toEqual(['src/cart.test.ts', 'README.md']);
  });

  it('includes rule flags with each file and reports truncated diffs', () => {
    const data = pr([file('db/migrations/1.sql', bigPatch(200))]);
    const plan = planChunks(data, analyzeRisk(data.files), limits);
    const [only] = plan.chunks.flat();
    expect(only?.ruleFlags.map((f) => f.ruleId)).toEqual(['migration']);
    expect(plan.truncated).toEqual(['db/migrations/1.sql']);
  });
});
