import { describe, expect, it } from 'vitest';
import { AllProvidersFailedError, CooldownStore, FallbackLlm, LlmNotConfiguredError } from '../../src/llm/fallback';
import { LlmError, type ParseResult } from '../../src/llm/types';
import { FakeProvider } from './fakes';

const request = { system: 's', prompt: 'p', maxOutputTokens: 100 };
const parseOk = (text: string): ParseResult<string> => (text.startsWith('ok') ? { ok: true, value: text } : { ok: false, error: `bad: ${text}` });

function clock(start = 1_000_000) {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

describe('FallbackLlm', () => {
  it('uses the first provider when it works', async () => {
    const a = new FakeProvider('a', ['ok-a']);
    const b = new FakeProvider('b', ['ok-b']);
    const result = await new FallbackLlm([a, b], new CooldownStore()).completeJson(request, parseOk);
    expect(result).toEqual({ value: 'ok-a', model: 'a/test-model' });
    expect(b.requests).toHaveLength(0);
  });

  it('moves to the next provider on a rate limit and skips the first until it resets', async () => {
    const t = clock();
    const cooldowns = new CooldownStore(t.now);
    const a = new FakeProvider('a', [new LlmError('rate_limited', 'a: 429', new Date(t.now() + 30_000)), 'ok-a']);
    const b = new FakeProvider('b', ['ok-b']);
    const llm = new FallbackLlm([a, b], cooldowns, t.now);

    expect((await llm.completeJson(request, parseOk)).model).toBe('b/test-model');
    expect((await llm.completeJson(request, parseOk)).model).toBe('b/test-model');
    expect(a.requests).toHaveLength(1);

    t.advance(31_000);
    expect((await llm.completeJson(request, parseOk)).model).toBe('a/test-model');
  });

  it('retries once on a 5xx before moving on', async () => {
    const a = new FakeProvider('a', [new LlmError('unavailable', 'a: 503'), 'ok-a']);
    const result = await new FallbackLlm([a], new CooldownStore()).completeJson(request, parseOk);
    expect(result.value).toBe('ok-a');
    expect(a.requests).toHaveLength(2);
  });

  it('retries invalid output once with the validation error in the prompt', async () => {
    const a = new FakeProvider('a', ['garbage', 'ok-fixed']);
    const result = await new FallbackLlm([a], new CooldownStore()).completeJson(request, parseOk);
    expect(result.value).toBe('ok-fixed');
    expect(a.requests[1]?.prompt).toContain('bad: garbage');
  });

  it('gives up on a provider after a second invalid reply and tries the next', async () => {
    const a = new FakeProvider('a', ['garbage']);
    const b = new FakeProvider('b', ['ok-b']);
    const result = await new FallbackLlm([a, b], new CooldownStore()).completeJson(request, parseOk);
    expect(result.value).toBe('ok-b');
    expect(a.requests).toHaveLength(2);
  });

  it('reports every failure and when the first provider frees up', async () => {
    const t = clock();
    const a = new FakeProvider('a', [new LlmError('rate_limited', 'a: 429', new Date(t.now() + 20_000))]);
    const b = new FakeProvider('b', [new LlmError('rate_limited', 'b: 429', new Date(t.now() + 50_000))]);
    const error = await new FallbackLlm([a, b], new CooldownStore(t.now), t.now).completeJson(request, parseOk).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AllProvidersFailedError);
    expect((error as AllProvidersFailedError).failures).toEqual(['a: 429', 'b: 429']);
    expect((error as AllProvidersFailedError).nextFree?.getTime()).toBe(t.now() + 20_000);
  });

  it('refuses to start with no providers', () => {
    expect(() => new FallbackLlm([])).toThrow(LlmNotConfiguredError);
  });
});
