import type { ApiErrorBody, ApiErrorCode, PrData, PrRef } from '@pr-lens/shared';

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

export async function fetchPrData(pr: PrRef, token: string, signal: AbortSignal): Promise<PrData> {
  const url = `${BACKEND_URL}/api/prs/${pr.owner}/${pr.repo}/${pr.number}`;

  let res: Response;
  try {
    res = await fetch(url, { headers: { 'X-GitHub-Token': token }, signal });
  } catch (err) {
    if (signal.aborted) throw err;
    throw new ApiError('network', `Can't reach the PR Lens backend at ${BACKEND_URL}.`);
  }

  if (res.ok) return (await res.json()) as PrData;

  // A non-JSON error body (e.g. a proxy's HTML page) falls through to the generic error below.
  const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
  if (body === null) throw new ApiError('internal', `Backend returned HTTP ${res.status}.`);
  const { code, message, resetAt } = body.error;
  throw new ApiError(code, message, resetAt === undefined ? null : new Date(resetAt));
}
