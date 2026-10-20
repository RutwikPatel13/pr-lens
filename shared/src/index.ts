// Types shared by the extension and the backend. Types only, no runtime code,
// so both bundlers can import the TypeScript source directly.

export type PrRef = {
  owner: string;
  repo: string;
  number: number;
};

export type PrState = 'open' | 'closed' | 'merged';

export type FileStatus = 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed' | 'unchanged';

export type PrFile = {
  path: string;
  previousPath: string | null;
  status: FileStatus;
  additions: number;
  deletions: number;
  // null when GitHub omits the patch (binary files and very large diffs).
  patch: string | null;
};

export type PrCommit = {
  sha: string;
  message: string;
  author: string | null;
};

export type LinkedIssue = {
  number: number;
  title: string;
  url: string;
  state: 'OPEN' | 'CLOSED';
};

export type PrData = PrRef & {
  title: string;
  body: string;
  author: string | null;
  url: string;
  state: PrState;
  headSha: string;
  baseRef: string;
  headRef: string;
  additions: number;
  deletions: number;
  commits: PrCommit[];
  files: PrFile[];
  linkedIssues: LinkedIssue[];
  // GitHub's API stops at 250 commits and 3000 files per PR.
  truncated: { commits: boolean; files: boolean };
};

export type ApiErrorCode =
  | 'missing_token'
  | 'invalid_request'
  | 'bad_token'
  | 'forbidden'
  | 'not_found'
  | 'rate_limited'
  | 'github_error'
  | 'internal';

export type ApiErrorBody = {
  error: {
    code: ApiErrorCode;
    message: string;
    // ISO timestamp, set for rate_limited.
    resetAt?: string;
  };
};
