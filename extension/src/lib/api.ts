import type {
  ApiErrorBody,
  ApiErrorCode,
  AskRequest,
  AskResponse,
  HealthResponse,
  PrAnalysis,
  PrRef,
  PrResponse,
  ReviewThread,
  SuggestedReply,
} from '@pr-lens/shared';
import { getBackendUrl } from './settings';

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode | 'network',
    message: string,
    readonly resetAt: Date | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// GET, or POST with a JSON payload when one is given.
async function requestJson<T>(path: string, token: string | null, signal: AbortSignal, payload?: unknown): Promise<T> {
  const backendUrl = await getBackendUrl();
  const headers: Record<string, string> = token === null ? {} : { 'X-GitHub-Token': token };
  if (payload !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(`${backendUrl}${path}`, {
      method: payload === undefined ? 'GET' : 'POST',
      headers,
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal,
    });
  } catch (err) {
    if (signal.aborted) throw err;
    throw new ApiError('network', `Can't reach the PR Lens backend at ${backendUrl}.`);
  }

  if (res.ok) return (await res.json()) as T;

  // A non-JSON error body (e.g. a proxy's HTML page) falls through to the generic error below.
  const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
  if (body === null) throw new ApiError('internal', `Backend returned HTTP ${res.status}.`);
  const { code, message, resetAt } = body.error;
  throw new ApiError(code, message, resetAt === undefined ? null : new Date(resetAt));
}

const prPath = (pr: PrRef) => `/api/prs/${pr.owner}/${pr.repo}/${pr.number}`;

// PR data and rule-based flags. Fast.
export function fetchPr(pr: PrRef, token: string, signal: AbortSignal): Promise<PrResponse> {
  return requestJson<PrResponse>(prPath(pr), token, signal);
}

// LLM summary, review order and flags. Instant when cached, otherwise seconds to minutes.
// refresh skips the cache and runs the model again.
export function fetchAnalysis(pr: PrRef, token: string, signal: AbortSignal, refresh = false): Promise<PrAnalysis> {
  return requestJson<PrAnalysis>(`${prPath(pr)}/analysis${refresh ? '?refresh=1' : ''}`, token, signal);
}

export function fetchHealth(signal: AbortSignal): Promise<HealthResponse> {
  return requestJson<HealthResponse>('/api/health', null, signal);
}

// Ask the PR: a fresh answer every time (not cached), usually a few seconds.
export function askPr(pr: PrRef, token: string, request: AskRequest, signal: AbortSignal): Promise<AskResponse> {
  return requestJson<AskResponse>(`${prPath(pr)}/ask`, token, signal, request);
}

export function fetchThreads(pr: PrRef, token: string, signal: AbortSignal): Promise<ReviewThread[]> {
  return requestJson<ReviewThread[]>(`${prPath(pr)}/threads`, token, signal);
}

export function suggestReply(pr: PrRef, token: string, threadId: string, signal: AbortSignal): Promise<SuggestedReply> {
  return requestJson<SuggestedReply>(`${prPath(pr)}/threads/suggest-reply`, token, signal, { threadId });
}
