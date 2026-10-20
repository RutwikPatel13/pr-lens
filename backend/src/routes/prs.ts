import type { ApiErrorBody } from '@pr-lens/shared';
import { Hono } from 'hono';
import { fetchPrData } from '../github/pull-request';

const OWNER = /^[A-Za-z0-9-]+$/;
const REPO = /^[A-Za-z0-9._-]+$/;
const NUMBER = /^\d+$/;

export const prs = new Hono();

prs.get('/:owner/:repo/:number', async (c) => {
  // The reviewer's own GitHub token. Passed through to GitHub, never stored or logged.
  const token = c.req.header('X-GitHub-Token');
  if (token === undefined || token === '') {
    return c.json<ApiErrorBody>({ error: { code: 'missing_token', message: 'Add a GitHub token in settings.' } }, 401);
  }

  const { owner, repo, number } = c.req.param();
  if (!OWNER.test(owner) || !REPO.test(repo) || !NUMBER.test(number)) {
    return c.json<ApiErrorBody>({ error: { code: 'invalid_request', message: 'Not a valid pull request path.' } }, 400);
  }

  return c.json(await fetchPrData(token, { owner, repo, number: Number(number) }));
});
