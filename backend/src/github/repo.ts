import type { PrRef, ReviewThread } from '@pr-lens/shared';
import { GitHubError, githubGet, githubGraphql } from './client';

const MAX_FILE_BYTES = 512 * 1024;

type GhContent = { type: string; encoding?: string; content?: string; size: number };

// A file's text at a commit, or null if it doesn't exist there, isn't a file, or is too big to read.
export async function fileAtCommit(token: string, ref: PrRef, path: string, sha: string): Promise<string | null> {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  try {
    const { data } = await githubGet<GhContent>(token, `/repos/${ref.owner}/${ref.repo}/contents/${encodedPath}?ref=${sha}`);
    if (data.type !== 'file' || data.encoding !== 'base64' || data.content === undefined || data.size > MAX_FILE_BYTES) {
      return null;
    }
    const bytes = Uint8Array.from(atob(data.content.replace(/\n/g, '')), (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch (err) {
    if (err instanceof GitHubError && err.code === 'not_found') return null;
    throw err;
  }
}

export type CodeSearchHit = { path: string; url: string; fragments: string[] };

type GhSearch = {
  items: { path: string; html_url: string; text_matches?: { fragment: string }[] }[];
};

// GitHub code search, scoped to the repo. It only indexes the default branch.
export async function searchCode(token: string, ref: PrRef, term: string): Promise<CodeSearchHit[]> {
  const q = encodeURIComponent(`${term} repo:${ref.owner}/${ref.repo}`);
  const { data } = await githubGet<GhSearch>(token, `/search/code?q=${q}&per_page=5`, 'application/vnd.github.text-match+json');
  return data.items.map((item) => ({
    path: item.path,
    url: item.html_url,
    fragments: (item.text_matches ?? []).map((m) => m.fragment),
  }));
}

type GhThreads = {
  repository: {
    pullRequest: {
      reviewThreads: {
        nodes: {
          id: string;
          isResolved: boolean;
          isOutdated: boolean;
          path: string;
          line: number | null;
          originalLine: number | null;
          comments: { nodes: { author: { login: string } | null; body: string; createdAt: string; url: string }[] };
        }[];
      };
    } | null;
  } | null;
};

const THREADS_QUERY = `
  query ($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        reviewThreads(first: 50) {
          nodes {
            id isResolved isOutdated path line originalLine
            comments(first: 30) { nodes { author { login } body createdAt url } }
          }
        }
      }
    }
  }
`;

export async function fetchReviewThreads(token: string, ref: PrRef): Promise<ReviewThread[]> {
  const data = await githubGraphql<GhThreads>(token, THREADS_QUERY, ref);
  const nodes = data.repository?.pullRequest?.reviewThreads.nodes ?? [];
  return nodes.map((t) => ({
    id: t.id,
    path: t.path,
    // line is null once the code moved on (outdated); originalLine is where it was written.
    line: t.line ?? t.originalLine,
    resolved: t.isResolved,
    outdated: t.isOutdated,
    comments: t.comments.nodes.map((c) => ({
      author: c.author?.login ?? null,
      body: c.body,
      createdAt: c.createdAt,
      url: c.url,
    })),
  }));
}

// The token's GitHub login, for per-user limits. Remembered per Worker isolate, keyed by a hash
// so the token itself is never kept.
const logins = new Map<string, string>();

export async function loginForToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const key = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const known = logins.get(key);
  if (known !== undefined) return known;
  const { data } = await githubGet<{ login: string }>(token, '/user');
  logins.set(key, data.login);
  return data.login;
}
