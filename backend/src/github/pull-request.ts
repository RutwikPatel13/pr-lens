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
  base: { ref: string };
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

export async function fetchPrData(token: string, ref: PrRef): Promise<PrData> {
  const base = `/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}`;

  const [{ data: pull }, commits, files, linked] = await Promise.all([
    githubGet<GhPull>(token, base),
    githubGetAll<GhCommit>(token, `${base}/commits?per_page=100`, MAX_COMMIT_PAGES),
    githubGetAll<GhFile>(token, `${base}/files?per_page=100`, MAX_FILE_PAGES),
    githubGraphql<GhLinkedIssues>(token, LINKED_ISSUES_QUERY, ref),
  ]);

  return {
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
      commits: commits.length < pull.commits,
      files: files.length < pull.changed_files,
    },
  };
}
