import { describe, expect, it } from 'vitest';
import { CooldownStore, FallbackLlm } from '../../src/llm/fallback';
import { analyzePr } from '../../src/llm/pipeline';
import { extractJson } from '../../src/llm/schemas';
import type { LlmRequest } from '../../src/llm/types';
import { analyzeRisk } from '../../src/risk/engine';
import { patch } from '../risk/helpers';
import { FakeProvider, file, pr } from './fakes';

const data = pr([
  file('src/refunds.ts', patch(1, 1, ['+export function refund(order) {', '+  return charge(-order.total);', '+}'])),
  file('db/migrations/2_refunds.sql', patch(0, 1, ['+ALTER TABLE orders ADD COLUMN refunded_at timestamptz;'])),
  file('src/refunds.test.ts', patch(1, 1, ['+it("refunds", () => {});'])),
  file('package-lock.json'),
]);

const mapReply = JSON.stringify({
  files: [
    { path: 'src/refunds.ts', role: 'core', summary: 'Adds refund().', concerns: [
      { line: 'R2', category: 'payments', severity: 'high', explanation: 'Negative charge instead of a refund API call.' },
      { line: 'R99', category: 'logic', severity: 'low', explanation: 'Cites a line that does not exist.' },
    ] },
    { path: 'db/migrations/2_refunds.sql', role: 'schema', summary: 'Adds refunded_at.', concerns: [] },
    { path: 'src/refunds.test.ts', role: 'service', summary: 'Tests refund.', concerns: [] },
    { path: 'src/made-up.ts', role: 'core', summary: 'Not in the PR.', concerns: [] },
  ],
});

const reduceReply = '```json\n' + JSON.stringify({
  what: 'Adds refunds.',
  why: 'Support refunding orders.',
  areas: ['payments', 'orders'],
  reviewOrder: [
    { path: 'src/refunds.ts', reason: 'core logic' },
    { path: 'src/made-up.ts', reason: 'hallucinated' },
    { path: 'src/refunds.ts', reason: 'duplicate' },
  ],
}) + '\n```';

const route = (r: LlmRequest) => (r.prompt.includes('"reviewOrder"') ? reduceReply : mapReply);

describe('analyzePr', () => {
  it('turns map notes and the reduce reply into a validated analysis', async () => {
    const provider = new FakeProvider('fake', [route]);
    const analysis = await analyzePr(new FallbackLlm([provider], new CooldownStore()), data, analyzeRisk(data.files));

    expect(analysis.summary).toEqual({ what: 'Adds refunds.', why: 'Support refunding orders.', areas: ['payments', 'orders'] });
    expect(analysis.notRead).toEqual([{ path: 'package-lock.json', reason: 'lockfile' }]);
    expect(analysis.models).toEqual(['fake/test-model']);

    // Invented role falls back to "other"; files the model skipped are appended by role.
    expect(analysis.reviewOrder.map((s) => [s.path, s.role])).toEqual([
      ['src/refunds.ts', 'core'],
      ['db/migrations/2_refunds.sql', 'schema'],
      ['src/refunds.test.ts', 'other'],
    ]);

    // A line the diff doesn't contain becomes a file-level flag instead of a wrong link.
    expect(analysis.flags.map((f) => [f.filePath, f.lines?.start ?? null, f.source])).toEqual([
      ['src/refunds.ts', 2, 'llm'],
      ['src/refunds.ts', null, 'llm'],
    ]);
  });

  it('sends the numbered diff and rule flags to the map step', async () => {
    const provider = new FakeProvider('fake', [route]);
    await analyzePr(new FallbackLlm([provider], new CooldownStore()), data, analyzeRisk(data.files));
    const mapPrompt = provider.requests[0]?.prompt ?? '';
    expect(mapPrompt).toContain('R2    +   return charge(-order.total);');
    expect(mapPrompt).toContain('rule flag migration at R1');
    expect(mapPrompt).not.toContain('package-lock.json');
  });

  it('retries the map step when the model leaves out a file', async () => {
    const partial = JSON.stringify({ files: [{ path: 'src/refunds.ts', role: 'core', summary: 'x', concerns: [] }] });
    let mapCalls = 0;
    const provider = new FakeProvider('fake', [(r) => {
      if (r.prompt.includes('"reviewOrder"')) return reduceReply;
      return ++mapCalls === 1 ? partial : mapReply;
    }]);
    await analyzePr(new FallbackLlm([provider], new CooldownStore()), data, analyzeRisk(data.files));
    expect(provider.requests[1]?.prompt).toContain('missing notes for: db/migrations/2_refunds.sql, src/refunds.test.ts');
  });
});

describe('extractJson', () => {
  it('pulls the object out of fences or surrounding prose', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(extractJson('Sure! Here it is: {"a":{"b":2}} Hope that helps.')).toBe('{"a":{"b":2}}');
  });
});
