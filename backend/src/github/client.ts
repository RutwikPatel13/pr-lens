const API_URL = 'https://api.github.com';

export type GitHubErrorCode = 'bad_token' | 'forbidden' | 'not_found' | 'rate_limited' | 'github_error';

export class GitHubError extends Error {
  constructor(
    readonly code: GitHubErrorCode,
    message: string,
    readonly resetAt?: Date,
  ) {
    super(message);
    this.name = 'GitHubError';
  }
}

function headers(token: string): HeadersInit {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    // GitHub rejects requests without a User-Agent, and Workers' fetch doesn't send one.
    'User-Agent': 'pr-lens',
  };
}

function rateLimitReset(res: Response): Date | null {
  if (res.headers.get('x-ratelimit-remaining') === '0') {
    const reset = Number(res.headers.get('x-ratelimit-reset'));
    return new Date(reset * 1000);
  }
  // Secondary rate limits send retry-after (seconds) instead.
  const retryAfter = res.headers.get('retry-after');
  if (retryAfter !== null) return new Date(Date.now() + Number(retryAfter) * 1000);
  return null;
}

function toGitHubError(res: Response): GitHubError {
  if (res.status === 401) {
    return new GitHubError('bad_token', 'GitHub rejected the token. It may be expired or mistyped.');
  }
  if (res.status === 403 || res.status === 429) {
    const resetAt = rateLimitReset(res);
    if (resetAt !== null) {
      return new GitHubError('rate_limited', 'GitHub rate limit reached.', resetAt);
    }
    return new GitHubError('forbidden', "The token doesn't have access to this repository.");
  }
  if (res.status === 404) {
    return new GitHubError('not_found', "Pull request not found, or the token can't see this repository.");
  }
  return new GitHubError('github_error', `GitHub returned HTTP ${res.status}.`);
}

export async function githubGet<T>(token: string, pathOrUrl: string): Promise<{ data: T; res: Response }> {
  const url = pathOrUrl.startsWith('https://') ? pathOrUrl : API_URL + pathOrUrl;
  const res = await fetch(url, { headers: headers(token) });
  if (!res.ok) throw toGitHubError(res);
  // The response shape is GitHub's documented one; T only names the fields we read.
  return { data: (await res.json()) as T, res };
}

function nextPageUrl(res: Response): string | null {
  const link = res.headers.get('link');
  return link?.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null;
}

// Follows rel="next" links until there are no more pages or maxPages is reached.
export async function githubGetAll<T>(token: string, path: string, maxPages: number): Promise<T[]> {
  const items: T[] = [];
  let url: string | null = path;
  for (let page = 0; url !== null && page < maxPages; page++) {
    const { data, res }: { data: T[]; res: Response } = await githubGet<T[]>(token, url);
    items.push(...data);
    url = nextPageUrl(res);
  }
  return items;
}

export async function githubGraphql<T>(token: string, query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API_URL}/graphql`, {
    method: 'POST',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw toGitHubError(res);

  // GraphQL reports most failures as HTTP 200 with an errors array.
  const body = (await res.json()) as { data?: T; errors?: { type?: string; message: string }[] };
  const firstError = body.errors?.[0];
  if (firstError !== undefined) {
    if (firstError.type === 'NOT_FOUND') throw new GitHubError('not_found', firstError.message);
    if (firstError.type === 'RATE_LIMITED') throw new GitHubError('rate_limited', firstError.message);
    throw new GitHubError('github_error', `GitHub GraphQL error: ${firstError.message}`);
  }
  if (body.data === undefined) throw new GitHubError('github_error', 'GitHub GraphQL returned no data.');
  return body.data;
}
