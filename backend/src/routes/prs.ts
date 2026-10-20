import type { ApiErrorBody, PrAnalysis, PrRef, PrResponse } from '@pr-lens/shared';
import { Hono, type Context } from 'hono';
import { fetchPrData } from '../github/pull-request';
import type { LlmEnv } from '../llm/config';
import { providersFromEnv } from '../llm/config';
import { FallbackLlm } from '../llm/fallback';
import { analyzePr } from '../llm/pipeline';
import { analyzeRisk } from '../risk/engine';

const OWNER = /^[A-Za-z0-9-]+$/;
const REPO = /^[A-Za-z0-9._-]+$/;
const NUMBER = /^\d+$/;

export const prs = new Hono<{ Bindings: LlmEnv }>();

type Request = { token: string; ref: PrRef } | { error: Response };

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

  const pr = await fetchPrData(req.token, req.ref);
  return c.json<PrResponse>({ pr, risk: analyzeRisk(pr.files) });
});

// Slow: LLM summary, review order and flags (map/reduce over the diff).
prs.get('/:owner/:repo/:number/analysis', async (c) => {
  const req = readRequest(c);
  if ('error' in req) return req.error;

  const llm = new FallbackLlm(providersFromEnv(c.env));
  const pr = await fetchPrData(req.token, req.ref);
  return c.json<PrAnalysis>(await analyzePr(llm, pr, analyzeRisk(pr.files)));
});
