import { LlmError } from '../types';

const TIMEOUT_MS = 60_000;
const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 60_000;

// Gemini puts the wait in the error body ("retryDelay": "13s"); OpenAI-style APIs use retry-after.
function retryAt(res: Response, body: string): Date {
  const header = res.headers.get('retry-after');
  if (header !== null && !Number.isNaN(Number(header))) return new Date(Date.now() + Number(header) * 1000);
  const delay = /"retryDelay":\s*"(\d+(?:\.\d+)?)s"/.exec(body)?.[1];
  if (delay !== undefined) return new Date(Date.now() + Number(delay) * 1000);
  return new Date(Date.now() + DEFAULT_RATE_LIMIT_COOLDOWN_MS);
}

// POSTs JSON and maps every non-reply outcome to an LlmError kind the fallback chain understands.
export async function postJson(provider: string, url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new LlmError('unavailable', `${provider}: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (res.ok) return res.json();

  const text = await res.text();
  const detail = `${provider}: HTTP ${res.status} ${text.slice(0, 200)}`;
  if (res.status === 429) throw new LlmError('rate_limited', detail, retryAt(res, text));
  if (res.status === 401 || res.status === 403) throw new LlmError('auth', detail);
  if (res.status >= 500) throw new LlmError('unavailable', detail);
  throw new LlmError('bad_request', detail);
}
