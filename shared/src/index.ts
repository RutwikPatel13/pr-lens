// Types shared by the extension and the backend. Runtime code lives in its own modules
// (patch.ts, custom-rules.ts), all plain TypeScript both bundlers import directly.

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
  | 'llm_not_configured'
  | 'llm_unavailable'
  | 'internal';

export type ApiErrorBody = {
  error: {
    code: ApiErrorCode;
    message: string;
    // ISO timestamp, set for rate_limited and llm_unavailable (when the first provider frees up).
    resetAt?: string;
  };
};

export type RiskCategory =
  | 'schema'
  | 'auth'
  | 'payments'
  | 'config'
  | 'dependencies'
  | 'tests'
  | 'secrets'
  // Only LLM flags: general correctness concerns that fit no rule category.
  | 'logic'
  // Only the reviewer's own rules; the flag's label carries the rule's name.
  | 'custom';

export type Severity = 'high' | 'medium' | 'low';

// RIGHT is the new version of the file (added/context lines), LEFT the old one (removed lines).
// Same naming as GitHub's review comment API.
export type LineRange = {
  side: 'LEFT' | 'RIGHT';
  start: number;
  end: number;
};

export type RiskFlag = {
  id: string;
  // 'rule': built-in rule engine. 'llm': the model (ruleId 'llm'). 'custom': the reviewer's own
  // rules, evaluated in the extension (ruleId 'custom:<rule id>').
  source: 'rule' | 'llm' | 'custom';
  // Display name for custom flags (the rule's name).
  label?: string;
  ruleId: string;
  category: RiskCategory;
  severity: Severity;
  filePath: string;
  // null when the file has no patch to point into (binary or too large).
  lines: LineRange | null;
  explanation: string;
};

// Why a file is deprioritized: noise a reviewer (and later the LLM) shouldn't spend time on.
export type SkipReason = 'lockfile' | 'generated' | 'vendored' | 'snapshot';

export type FileRisk = {
  path: string;
  categories: RiskCategory[];
  skipReason: SkipReason | null;
};

export type RiskReport = {
  flags: RiskFlag[];
  files: FileRisk[];
};

export type PrResponse = {
  pr: PrData;
  risk: RiskReport;
};

// Where a file sits in the system, used to order the review (schema first, tests last).
export type FileRole = 'schema' | 'config' | 'core' | 'api' | 'ui' | 'test' | 'docs' | 'other';

export type NotReadReason = SkipReason | 'no_patch' | 'over_budget';

export type NotReadFile = {
  path: string;
  reason: NotReadReason;
};

export type ReviewStep = {
  path: string;
  role: FileRole;
  reason: string;
};

export type PrAnalysis = {
  summary: {
    what: string;
    why: string;
    areas: string[];
  };
  reviewOrder: ReviewStep[];
  flags: RiskFlag[];
  // Files the model didn't see, so the reviewer knows what the summary doesn't cover.
  notRead: NotReadFile[];
  // Paths whose diff was cut short before the model saw it.
  truncated: string[];
  // Which provider/model handled the calls, in the order they were used.
  models: string[];
  // ISO timestamp of when the model ran. Older than now when served from the cache.
  generatedAt: string;
  cached: boolean;
};

// GET /api/health: lets the settings page check the backend URL and show what's configured.
export type HealthResponse = {
  ok: true;
  llmProviders: string[];
  cache: boolean;
};

// Ask the PR. A source is a place the answer relies on: a PR file opens on the Files tab
// (url null); anything else links to GitHub (url set).
export type AskSource = {
  path: string;
  line: number | null;
  url: string | null;
};

export type AskTurn = { question: string; answer: string };

export type AskRequest = {
  question: string;
  // Earlier turns in this conversation, oldest first. Only the last few are sent to the model.
  history: AskTurn[];
};

export type AskResponse = {
  answer: string;
  sources: AskSource[];
  // What was looked at, in plain words, so the reader knows what the answer is based on.
  searched: string[];
  models: string[];
  // First questions are cached per commit; true when this answer came from the cache.
  cached: boolean;
};

export type ThreadComment = {
  author: string | null;
  body: string;
  createdAt: string;
  url: string;
};

export type ReviewThread = {
  id: string;
  path: string;
  line: number | null;
  resolved: boolean;
  outdated: boolean;
  comments: ThreadComment[];
};

export type SuggestedReply = {
  reply: string;
  reason: string;
  models: string[];
  // Cached until the thread gets a new comment or the PR a new commit.
  cached: boolean;
};

// A reviewer's own rule, stored in chrome.storage.sync and run by the extension.
export type CustomRuleKind = 'path' | 'added' | 'removed';

export type CustomRule = {
  id: string;
  name: string;
  kind: CustomRuleKind;
  // A glob for 'path' rules; text (or a regular expression when regex is set) for line rules.
  pattern: string;
  regex: boolean;
  severity: Severity;
  explanation: string;
  enabled: boolean;
};
