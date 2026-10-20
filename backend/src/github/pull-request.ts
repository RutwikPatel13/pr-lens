import type { FileStatus, LinkedIssue, PrData, PrRef } from '@pr-lens/shared';
import { githubGet, githubGetAll, githubGraphql } from './client';

// Only the fields we read from each GitHub response.
type GhPull = {
  title: string;
  body: string | null;
  html_url: string;
  state: 'open' | 'closed';
  merged_at: string | null;
  user: { login: string } | null;
  head: { sha: string; ref: string };
  base: { ref: string; repo: { private: boolean } };
  additions: number;
  deletions: number;
  commits: number;
  changed_files: number;
};

type GhCommit = {
  sha: string;
  commit: { message: string; author: { name: string } | null };
  author: { login: string } | null;
};

type GhFile = {
  filename: string;
  previous_filename?: string;
  status: FileStatus;
  additions: number;
  deletions: number;
  patch?: string;
};

type GhLinkedIssues = {
  repository: {
    pullRequest: { closingIssuesReferences: { nodes: LinkedIssue[] } } | null;
  } | null;
};

const LINKED_ISSUES_QUERY = `
  query ($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        closingIssuesReferences(first: 10) {
          nodes { number title url state }
        }
      }
    }
  }
`;

// GitHub caps these endpoints at 250 commits and 3000 files; 100 per page.
const MAX_COMMIT_PAGES = 3;
const MAX_FILE_PAGES = 30;

// The cheap part: one request, always fetched fresh. Title, description and state can change
// without a new commit, and headSha decides whether the cached details still apply.
export type PullMeta = {
  pr: Omit<PrData, 'commits' | 'files' | 'linkedIssues' | 'truncated'>;
  commitCount: number;
  fileCount: number;
  isPublic: boolean;
};

// The expensive part: paginated commits and files, plus linked issues. Cacheable by headSha.
export type PrDetails = Pick<PrData, 'commits' | 'files' | 'linkedIssues' | 'truncated'>;

const pullPath = (ref: PrRef) => `/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}`;

export async function fetchPullMeta(token: string, ref: PrRef): Promise<PullMeta> {
  const { data: pull } = await githubGet<GhPull>(token, pullPath(ref));
  return {
    pr: {
      ...ref,
      title: pull.title,
      body: pull.body ?? '',
      author: pull.user?.login ?? null,
      url: pull.html_url,
      state: pull.merged_at !== null ? 'merged' : pull.state,
      headSha: pull.head.sha,
      baseRef: pull.base.ref,
      headRef: pull.head.ref,
      additions: pull.additions,
      deletions: pull.deletions,
    },
    commitCount: pull.commits,
    fileCount: pull.changed_files,
    isPublic: !pull.base.repo.private,
  };
}

// If a commit is pushed between fetchPullMeta and this call, these details are from the newer
// head. Rare, and the next request (with the new headSha) misses the cache and refetches.
export async function fetchPrDetails(token: string, ref: PrRef, meta: PullMeta): Promise<PrDetails> {
  const base = pullPath(ref);
  const [commits, files, linked] = await Promise.all([
    githubGetAll<GhCommit>(token, `${base}/commits?per_page=100`, MAX_COMMIT_PAGES),
    githubGetAll<GhFile>(token, `${base}/files?per_page=100`, MAX_FILE_PAGES),
    githubGraphql<GhLinkedIssues>(token, LINKED_ISSUES_QUERY, ref),
  ]);

  return {
    commits: commits.map((c) => ({
      sha: c.sha,
      message: c.commit.message,
      author: c.author?.login ?? c.commit.author?.name ?? null,
    })),
    files: files.map((f) => ({
      path: f.filename,
      previousPath: f.previous_filename ?? null,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch ?? null,
    })),
    linkedIssues: linked.repository?.pullRequest?.closingIssuesReferences.nodes ?? [],
    truncated: {
      commits: commits.length < meta.commitCount,
      files: files.length < meta.fileCount,
    },
  };
}
