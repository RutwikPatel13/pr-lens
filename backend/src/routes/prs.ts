import type { ApiErrorBody, PrAnalysis, PrRef, PrResponse } from '@pr-lens/shared';
import { Hono, type Context } from 'hono';
import { kvCache } from '../cache/json-cache';
import type { AppEnv } from '../env';
import { fetchPrDetails, fetchPullMeta } from '../github/pull-request';
import { providersFromEnv } from '../llm/config';
import { FallbackLlm } from '../llm/fallback';
import { analyzePr } from '../llm/pipeline';
import { PrService } from '../pr-service';

const OWNER = /^[A-Za-z0-9-]+$/;
const REPO = /^[A-Za-z0-9._-]+$/;
const NUMBER = /^\d+$/;

export const prs = new Hono<{ Bindings: AppEnv }>();

type Request = { token: string; ref: PrRef } | { error: Response };

function prService(env: AppEnv, token: string): PrService {
  return new PrService({
    fetchMeta: (ref) => fetchPullMeta(token, ref),
    fetchDetails: (ref, meta) => fetchPrDetails(token, ref, meta),
    // Built only on a cache miss, so cached analyses still load if no LLM key is configured.
    analyze: (pr, risk) => analyzePr(new FallbackLlm(providersFromEnv(env)), pr, risk),
    cache: env.CACHE === undefined ? null : kvCache(env.CACHE),
    now: () => new Date(),
  });
}

// Shared by both routes: the reviewer's token and a valid owner/repo/number.
function readRequest(c: Context): Request {
  // The reviewer's own GitHub token. Passed through to GitHub, never stored or logged.
  const token = c.req.header('X-GitHub-Token');
  if (token === undefined || token === '') {
    return { error: c.json<ApiErrorBody>({ error: { code: 'missing_token', message: 'Add a GitHub token in settings.' } }, 401) };
  }

  const { owner, repo, number } = c.req.param();
  if (owner === undefined || repo === undefined || number === undefined || !OWNER.test(owner) || !REPO.test(repo) || !NUMBER.test(number)) {
    return { error: c.json<ApiErrorBody>({ error: { code: 'invalid_request', message: 'Not a valid pull request path.' } }, 400) };
  }
  return { token, ref: { owner, repo, number: Number(number) } };
}

// Fast: GitHub data plus rule-based flags. The panel shows this right away.
prs.get('/:owner/:repo/:number', async (c) => {
  const req = readRequest(c);
  if ('error' in req) return req.error;

  return c.json<PrResponse>(await prService(c.env, req.token).getPr(req.ref));
});

// Slow on a cache miss: LLM summary, review order and flags (map/reduce over the diff).
// ?refresh=1 skips the cached analysis and runs the model again.
prs.get('/:owner/:repo/:number/analysis', async (c) => {
  const req = readRequest(c);
  if ('error' in req) return req.error;

  const refresh = c.req.query('refresh') === '1';
  return c.json<PrAnalysis>(await prService(c.env, req.token).getAnalysis(req.ref, { refresh }));
});
