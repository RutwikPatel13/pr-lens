import type { PrRef } from '@pr-lens/shared';

// Bump to invalidate every cached entry of that kind: old keys stop matching and expire.
// PR_DETAILS_VERSION: GitHub fields we store, or the risk rules (their flags are cached with the details).
// ANALYSIS_VERSION: prompts, chunking, models, or the PrAnalysis shape.
export const PR_DETAILS_VERSION = 1;
export const ANALYSIS_VERSION = 1;

export const CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;

// GitHub owner/repo names are case-insensitive; the URL may use either.
const prId = (ref: PrRef, headSha: string) => `${ref.owner.toLowerCase()}/${ref.repo.toLowerCase()}#${ref.number}@${headSha}`;

export const detailsKey = (ref: PrRef, headSha: string) => `details:v${PR_DETAILS_VERSION}:${prId(ref, headSha)}`;
export const analysisKey = (ref: PrRef, headSha: string) => `analysis:v${ANALYSIS_VERSION}:${prId(ref, headSha)}`;
