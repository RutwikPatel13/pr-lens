import type { ApiErrorBody } from '@pr-lens/shared';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { GitHubError, type GitHubErrorCode } from './github/client';
import type { LlmEnv } from './llm/config';
import { AllProvidersFailedError, LlmNotConfiguredError } from './llm/fallback';
import { prs } from './routes/prs';

const app = new Hono<{ Bindings: LlmEnv }>();

app.use(
  '/api/*',
  cors({
    // Any extension origin for now. Pin to the published extension ID once it has one.
    origin: (origin) => (origin.startsWith('chrome-extension://') ? origin : null),
    allowHeaders: ['X-GitHub-Token'],
    allowMethods: ['GET'],
  }),
);

app.route('/api/prs', prs);

const STATUS: Record<GitHubErrorCode, ContentfulStatusCode> = {
  bad_token: 401,
  forbidden: 403,
  not_found: 404,
  rate_limited: 429,
  github_error: 502,
};

app.onError((err, c) => {
  if (err instanceof GitHubError) {
    const body: ApiErrorBody = { error: { code: err.code, message: err.message } };
    if (err.resetAt !== undefined) body.error.resetAt = err.resetAt.toISOString();
    return c.json(body, STATUS[err.code]);
  }
  if (err instanceof LlmNotConfiguredError) {
    return c.json<ApiErrorBody>({ error: { code: 'llm_not_configured', message: err.message } }, 503);
  }
  if (err instanceof AllProvidersFailedError) {
    console.warn(err.message);
    const body: ApiErrorBody = { error: { code: 'llm_unavailable', message: 'Every free LLM provider is busy or failed. Try again shortly.' } };
    if (err.nextFree !== null) body.error.resetAt = err.nextFree.toISOString();
    return c.json(body, 503);
  }
  console.error(err);
  return c.json<ApiErrorBody>({ error: { code: 'internal', message: 'Something went wrong on the server.' } }, 500);
});

export default app;
