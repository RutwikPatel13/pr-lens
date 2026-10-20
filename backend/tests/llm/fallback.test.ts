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
    // Both resets are past the 20s wait cap, so it fails instead of waiting.
    const a = new FakeProvider('a', [new LlmError('rate_limited', 'a: 429', new Date(t.now() + 30_000))]);
    const b = new FakeProvider('b', [new LlmError('rate_limited', 'b: 429', new Date(t.now() + 50_000))]);
    const error = await new FallbackLlm([a, b], new CooldownStore(t.now), t.now).completeJson(request, parseOk).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AllProvidersFailedError);
    expect((error as AllProvidersFailedError).failures).toEqual(['a: 429', 'b: 429']);
    expect((error as AllProvidersFailedError).nextFree?.getTime()).toBe(t.now() + 30_000);
  });

  it('refuses to start with no providers', () => {
    expect(() => new FallbackLlm([])).toThrow(LlmNotConfiguredError);
  });
});

describe('FallbackLlm under free-tier pressure', () => {
  it('cools a provider down after it fails twice with 5xx, so the next chunk skips it', async () => {
    const t = clock();
    const cooldowns = new CooldownStore(t.now);
    const a = new FakeProvider('a', [new LlmError('unavailable', 'a: 503')]);
    const b = new FakeProvider('b', ['ok-b']);
    const llm = new FallbackLlm([a, b], cooldowns, t.now);

    await llm.completeJson(request, parseOk);
    await llm.completeJson(request, parseOk);
    expect(a.requests).toHaveLength(2); // one call plus its retry, then skipped
  });

  it('waits for a provider that frees up soon instead of failing', async () => {
    const t = clock();
    const waits: number[] = [];
    const sleep = async (ms: number) => {
      waits.push(ms);
      t.advance(ms);
    };
    const a = new FakeProvider('a', [new LlmError('rate_limited', 'a: 429', new Date(t.now() + 7_000)), 'ok-a']);
    const llm = new FallbackLlm([a], new CooldownStore(t.now), t.now, sleep);

    expect((await llm.completeJson(request, parseOk)).value).toBe('ok-a');
    expect(waits).toEqual([7_000]);
  });

  it('fails fast when the wait would be too long', async () => {
    const t = clock();
    const sleep = async () => {
      throw new Error('should not wait');
    };
    const a = new FakeProvider('a', [new LlmError('rate_limited', 'a: 429', new Date(t.now() + 5 * 60_000))]);
    const llm = new FallbackLlm([a], new CooldownStore(t.now), t.now, sleep);
    await expect(llm.completeJson(request, parseOk)).rejects.toBeInstanceOf(AllProvidersFailedError);
  });
});

describe('FallbackLlm: waiting beats switching', () => {
  it('waits out a short rate limit on the same provider instead of moving to a slower one', async () => {
    const t = clock();
    const waits: number[] = [];
    const sleep = async (ms: number) => {
      waits.push(ms);
      t.advance(ms);
    };
    const a = new FakeProvider('a', [new LlmError('rate_limited', 'a: 429', new Date(t.now() + 8_000)), 'ok-a']);
    const b = new FakeProvider('b', ['ok-b']);
    const result = await new FallbackLlm([a, b], new CooldownStore(t.now), t.now, sleep).completeJson(request, parseOk);

    expect(result.value).toBe('ok-a');
    expect(waits).toEqual([8_000]);
    expect(b.requests).toHaveLength(0);
  });

  it('does not retry a timeout, and cools the provider down', async () => {
    const t = clock();
    const a = new FakeProvider('a', [new LlmError('timeout', 'a: timed out'), 'ok-a']);
    const b = new FakeProvider('b', ['ok-b']);
    const llm = new FallbackLlm([a, b], new CooldownStore(t.now), t.now);

    expect((await llm.completeJson(request, parseOk)).value).toBe('ok-b');
    expect((await llm.completeJson(request, parseOk)).value).toBe('ok-b');
    expect(a.requests).toHaveLength(1);
  });
});

describe('FallbackLlm: provider-reported bad output', () => {
  it('retries once when the provider itself rejects its malformed JSON', async () => {
    const a = new FakeProvider('a', [new LlmError('bad_output', 'a: json_validate_failed'), 'ok-a']);
    const result = await new FallbackLlm([a], new CooldownStore()).completeJson(request, parseOk);
    expect(result.value).toBe('ok-a');
    expect(a.requests[1]?.prompt).toContain('json_validate_failed');
  });
});
