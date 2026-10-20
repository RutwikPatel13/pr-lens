import { afterEach, describe, expect, it, vi } from 'vitest';
import { postJson } from '../../src/llm/providers/http';
import { LlmError } from '../../src/llm/types';

function respond(status: number, body: string, headers: Record<string, string> = {}) {
  vi.stubGlobal('fetch', async () => new Response(body, { status, headers }));
}

async function call(): Promise<LlmError> {
  try {
    await postJson('p', 'https://example.test', {}, {});
  } catch (err) {
    if (err instanceof LlmError) return err;
    throw err;
  }
  throw new Error('expected postJson to fail');
}

describe('postJson error mapping', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('treats 429 as a rate limit and reads retry-after', async () => {
    respond(429, '{}', { 'retry-after': '7' });
    const err = await call();
    expect(err.kind).toBe('rate_limited');
    expect((err.retryAt?.getTime() ?? 0) - Date.now()).toBeGreaterThan(6_000);
  });

  it("reads Gemini's retryDelay from the body", async () => {
    respond(429, '{"error":{"details":[{"retryDelay": "13s"}]}}');
    const err = await call();
    expect((err.retryAt?.getTime() ?? 0) - Date.now()).toBeGreaterThan(12_000);
  });

  it("prefers Groq's 'try again in' message over a too-short retry-after header", async () => {
    respond(429, '{"error":{"message":"Rate limit reached on tokens per minute (TPM): Limit 8000, Used 3804, Requested 5021. Please try again in 6.18s."}}', { 'retry-after': '1' });
    const wait = ((await call()).retryAt?.getTime() ?? 0) - Date.now();
    expect(wait).toBeGreaterThan(6_000);
    expect(wait).toBeLessThan(8_000);
  });

  it('reads minute-and-second waits', async () => {
    respond(429, '{"error":{"message":"Please try again in 1m2.5s."}}');
    expect(((await call()).retryAt?.getTime() ?? 0) - Date.now()).toBeGreaterThan(61_000);
  });

  it("treats Groq's json_validate_failed as bad output, which is worth a retry", async () => {
    respond(400, '{"error":{"message":"Failed to generate JSON.","code":"json_validate_failed"}}');
    expect((await call()).kind).toBe('bad_output');
  });

  it("treats Groq's 429 'Request too large' as a bad request, since waiting won't fix it", async () => {
    respond(429, '{"error":{"message":"Request too large for model `x` on tokens per minute (TPM): Limit 8000, Requested 9500"}}');
    expect((await call()).kind).toBe('bad_request');
  });

  it('maps 5xx to unavailable and 401 to auth', async () => {
    respond(503, '{"error":{"message":"high demand"}}');
    expect((await call()).kind).toBe('unavailable');
    respond(401, '{}');
    expect((await call()).kind).toBe('auth');
  });
});
