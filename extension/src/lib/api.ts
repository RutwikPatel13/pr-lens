import type { ApiErrorBody, ApiErrorCode, PrAnalysis, PrRef, PrResponse } from '@pr-lens/shared';

export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8787';

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

async function getJson<T>(path: string, token: string, signal: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}${path}`, { headers: { 'X-GitHub-Token': token }, signal });
  } catch (err) {
    if (signal.aborted) throw err;
    throw new ApiError('network', `Can't reach the PR Lens backend at ${BACKEND_URL}.`);
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
  return getJson<PrResponse>(prPath(pr), token, signal);
}

// LLM summary, review order and flags. Takes seconds to a minute.
export function fetchAnalysis(pr: PrRef, token: string, signal: AbortSignal): Promise<PrAnalysis> {
  return getJson<PrAnalysis>(`${prPath(pr)}/analysis`, token, signal);
}
