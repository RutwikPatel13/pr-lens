import { LlmError } from '../types';

const TIMEOUT_MS = 60_000;
const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 60_000;

// Where each provider says how long to wait, most precise first:
// Groq's message ("Please try again in 6.18s" / "1m2.5s"; its retry-after header can say 1s
// when the real wait is longer), Gemini's body ("retryDelay": "13s"), then retry-after.
function retryAt(res: Response, body: string): Date {
  const groq = /try again in (?:(\d+)m)?(\d+(?:\.\d+)?)s/.exec(body);
  if (groq !== null) return new Date(Date.now() + (Number(groq[1] ?? 0) * 60 + Number(groq[2])) * 1000);
  const gemini = /"retryDelay":\s*"(\d+(?:\.\d+)?)s"/.exec(body)?.[1];
  if (gemini !== undefined) return new Date(Date.now() + Number(gemini) * 1000);
  const header = res.headers.get('retry-after');
  if (header !== null && !Number.isNaN(Number(header))) return new Date(Date.now() + Number(header) * 1000);
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
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new LlmError('timeout', `${provider}: no reply within ${TIMEOUT_MS / 1000}s`);
    }
    throw new LlmError('unavailable', `${provider}: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (res.ok) return res.json();

  const text = await res.text();
  const detail = `${provider}: HTTP ${res.status} ${text.slice(0, 200)}`;
  // Groq answers 429 when one request alone exceeds the per-minute token limit. Waiting won't help.
  if (res.status === 429 && /request too large/i.test(text)) throw new LlmError('bad_request', detail);
  if (res.status === 429) {
    const at = retryAt(res, text);
    throw new LlmError('rate_limited', `${detail} (retry in ${Math.ceil((at.getTime() - Date.now()) / 1000)}s)`, at);
  }
  if (res.status === 401 || res.status === 403) throw new LlmError('auth', detail);
  if (res.status >= 500) throw new LlmError('unavailable', detail);
  // Groq validates JSON mode output itself and returns 400 when the model's JSON is malformed.
  if (/json_validate_failed/.test(text)) throw new LlmError('bad_output', detail);
  throw new LlmError('bad_request', detail);
}
