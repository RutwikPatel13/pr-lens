import type { PrAnalysis, PrData, PrRef, PrResponse, RiskReport } from '@pr-lens/shared';
import { analysisKey, CACHE_TTL_SECONDS, detailsKey } from './cache/keys';
import type { JsonCache } from './cache/json-cache';
import type { PrDetails, PullMeta } from './github/pull-request';
import { analyzeRisk } from './risk/engine';

export type PrServiceDeps = {
  fetchMeta: (ref: PrRef) => Promise<PullMeta>;
  fetchDetails: (ref: PrRef, meta: PullMeta) => Promise<PrDetails>;
  analyze: (pr: PrData, risk: RiskReport) => Promise<Omit<PrAnalysis, 'generatedAt' | 'cached'>>;
  // null disables caching (no KV binding).
  cache: JsonCache | null;
  now: () => Date;
};

type CachedDetails = { details: PrDetails; risk: RiskReport };

// Fetches PR data and analyses, cached by head commit. Only public repos are cached: the cache
// is shared by everyone using the backend, so a private PR must never be served from it.
export class PrService {
  constructor(private readonly deps: PrServiceDeps) {}

  async getPr(ref: PrRef): Promise<PrResponse> {
    const meta = await this.deps.fetchMeta(ref);
    const { details, risk } = await this.detailsAndRisk(ref, meta);
    return { pr: { ...meta.pr, ...details }, risk };
  }

  // refresh skips the cache read (the reviewer asked for a new analysis) but still writes.
  async getAnalysis(ref: PrRef, { refresh = false } = {}): Promise<PrAnalysis> {
    const meta = await this.deps.fetchMeta(ref);
    const cache = meta.isPublic ? this.deps.cache : null;
    const key = analysisKey(ref, meta.pr.headSha);

    if (cache !== null && !refresh) {
      const hit = await cache.get<PrAnalysis>(key);
      if (hit !== null) return { ...hit, cached: true };
    }

    const { details, risk } = await this.detailsAndRisk(ref, meta);
    const result = await this.deps.analyze({ ...meta.pr, ...details }, risk);
    const analysis: PrAnalysis = { ...result, generatedAt: this.deps.now().toISOString(), cached: false };
    await cache?.put(key, analysis, CACHE_TTL_SECONDS);
    return analysis;
  }

  private async detailsAndRisk(ref: PrRef, meta: PullMeta): Promise<CachedDetails> {
    const cache = meta.isPublic ? this.deps.cache : null;
    const key = detailsKey(ref, meta.pr.headSha);

    const hit = await cache?.get<CachedDetails>(key);
    if (hit !== undefined && hit !== null) return hit;

    const details = await this.deps.fetchDetails(ref, meta);
    const value = { details, risk: analyzeRisk(details.files) };
    await cache?.put(key, value, CACHE_TTL_SECONDS);
    return value;
  }
}
