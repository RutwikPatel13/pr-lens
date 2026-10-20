import type { ApiErrorBody, AskResponse, PrAnalysis, PrRef, PrResponse, ReviewThread, SuggestedReply } from '@pr-lens/shared';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { askPr, suggestReply, type AskDeps } from '../ask/pipeline';
import { kvCache } from '../cache/json-cache';
import { askKey, replyKey } from '../cache/keys';
import type { AppEnv } from '../env';
import { fetchPrDetails, fetchPullMeta } from '../github/pull-request';
import { fetchReviewThreads, fileAtCommit, searchCode } from '../github/repo';
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

// Shared by every route: the reviewer's token and a valid owner/repo/number.
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

function askDeps(token: string, ref: PrRef, headSha: string): AskDeps {
  return {
    fileAtCommit: (path) => fileAtCommit(token, ref, path, headSha),
    searchCode: (term) => searchCode(token, ref, term),
  };
}

const AskBody = z.object({
  question: z.string().trim().min(1).max(500),
  history: z
    .array(z.object({ question: z.string().max(500), answer: z.string().max(4_000) }))
    .max(20)
    .default([]),
});

function invalidBody(c: Context, message: string): Response {
  return c.json<ApiErrorBody>({ error: { code: 'invalid_request', message } }, 400);
}

// Ask the PR: plan what to read, gather it from GitHub, answer with checked sources. Not cached.
prs.post('/:owner/:repo/:number/ask', async (c) => {
  const req = readRequest(c);
  if ('error' in req) return req.error;
  const body = AskBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return invalidBody(c, 'Send {"question": "...", "history": [...]} with a question under 500 characters.');

  const service = prService(c.env, req.token);
  const { pr, risk, isPublic } = await service.getPrContext(req.ref);
  // Built inside run(), so a cached answer still loads if no LLM key is configured.
  const run = () => askPr(new FallbackLlm(providersFromEnv(c.env)), askDeps(req.token, req.ref, pr.headSha), pr, risk, body.data);

  // First questions (the suggested ones, or any common question) are cached per commit.
  // Follow-ups depend on the conversation, so they always run.
  if (body.data.history.length > 0) return c.json<AskResponse>({ ...(await run()), cached: false });
  const key = await askKey(req.ref, pr.headSha, body.data.question);
  return c.json<AskResponse>(await service.cached(key, isPublic, run));
});

// Review threads (inline comments) on the PR, newest state from GitHub. Not cached.
prs.get('/:owner/:repo/:number/threads', async (c) => {
  const req = readRequest(c);
  if ('error' in req) return req.error;
  return c.json<ReviewThread[]>(await fetchReviewThreads(req.token, req.ref));
});

const ReplyBody = z.object({ threadId: z.string().min(1).max(200) });

// A suggested next reply for one review thread. Copy-only in the panel; nothing is posted.
prs.post('/:owner/:repo/:number/threads/suggest-reply', async (c) => {
  const req = readRequest(c);
  if ('error' in req) return req.error;
  const body = ReplyBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return invalidBody(c, 'Send {"threadId": "..."}.');

  const service = prService(c.env, req.token);
  const [{ pr, isPublic }, threads] = await Promise.all([service.getPrContext(req.ref), fetchReviewThreads(req.token, req.ref)]);
  const thread = threads.find((t) => t.id === body.data.threadId);
  if (thread === undefined) {
    return c.json<ApiErrorBody>({ error: { code: 'not_found', message: 'That review thread is no longer on this PR.' } }, 404);
  }
  const last = thread.comments[thread.comments.length - 1];
  const key = replyKey(req.ref, pr.headSha, thread.id, thread.comments.length, last?.createdAt ?? '');
  const run = () => suggestReply(new FallbackLlm(providersFromEnv(c.env)), askDeps(req.token, req.ref, pr.headSha), pr, thread);
  return c.json<SuggestedReply>(await service.cached(key, isPublic, run));
});
