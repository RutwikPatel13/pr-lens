# Decisions

Short notes on choices with a real tradeoff: what was picked and why.

## 2026-10-19: Backend is Node + TypeScript + Hono on Cloudflare Workers

Picked over Python/FastAPI so the extension and backend can share types (the analysis
JSON schema especially) through `/shared` instead of keeping two copies in sync.
Hono runs natively on Workers, and the Workers free tier doesn't put the server to
sleep, so there's no 30-second cold start in the middle of a demo (Render's free
tier does this).

## 2026-10-19: Free LLM tiers behind a provider interface, with fallback

The MVP should cost $0 to run. The Claude API has no free tier, so the pipeline
talks to an `LlmProvider` interface, and a fallback chain runs free providers in
order (e.g. Gemini, Groq, OpenRouter free models). When one returns a 429 or a
quota error, it cools down until its reset time and the next provider takes over.

Tradeoffs:
- Quality varies between providers, so one PR's analysis may come from a
  different model than another's. Each analysis stores the provider/model that
  produced it, and schema validation on every response catches malformed output
  whichever model wrote it.
- Free tiers may use prompts for training. Acceptable while the MVP is public
  repos only. It has to be revisited before private repo support (v2).
- Claude stays available as an optional paid provider: set its key and put it in
  the chain.

The head-SHA cache matters even more here: each PR is analyzed once, so
free-tier limits are spent only on new PRs or new commits.

## 2026-10-19: Side panel is enabled per tab, opened from the toolbar (superseded below)

`chrome.sidePanel.open()` only works from a user gesture, so the panel can't open
by itself when a PR loads. The service worker enables the panel only on PR tabs,
and clicking the toolbar icon opens it (`openPanelOnActionClick`).

## 2026-10-19: PR detection in the service worker, not a content script (superseded below)

GitHub navigates client-side (no full page loads), so a content script injected
on one page doesn't re-run when you move to a PR. `chrome.tabs.onUpdated` fires on
every URL change, including history API navigation, so the service worker sees
them all. The content script is kept for DOM work like scrolling to a line.

## 2026-10-19: Plain fetch for GitHub, no Octokit

The backend needs four calls (PR, commits, files, one GraphQL query for linked
issues). A ~100-line client with `fetch` covers that, runs on Workers with no
extra bundle, and keeps error mapping (bad token, rate limit, not found) in one
place we control. Octokit is worth revisiting if v2 needs many more endpoints.

## 2026-10-19: Per-file patches instead of the full PR diff

The files endpoint already returns each file's patch, and the map step
summarizes per file anyway, so a separate full-diff download would be redundant.
GitHub leaves `patch` out for binary and very large files. Those come through as
`patch: null`, and the panel says how many files had no diff.

## 2026-10-19: The reviewer's PAT is passed through, not stored server-side

The panel keeps the token in `chrome.storage.local` (not `sync`, so it isn't
copied to the user's Google account) and sends it in an `X-GitHub-Token`
header. The backend uses it for that request only and never stores or logs it.
That keeps the backend stateless for now. The same token can later identify the
user for per-user rate limits on LLM calls.

## 2026-10-19: Side panel stays open across tabs; no auto-open

Replaces the per-tab panel above. With a per-tab panel, leaving a PR closed it
and every PR needed another click. Now the panel is window-wide: open it once
(toolbar icon or Alt+Shift+P) and it stays open, filling in whenever the active
tab is a PR and showing a placeholder elsewhere. The panel follows the active
tab with `chrome.tabs` events, so the service worker only sets the click behavior.

Chrome's side panel can't open without a user gesture. Extensions that appear by
themselves (Simplify, for example) inject their own UI into the page with a
content script. That would work here too, but it means living inside GitHub's
layout and markup, which this project avoids. Revisit if the click turns out to
matter in practice.

## 2026-10-19: Risk engine is path rules plus line rules over parsed patches

Two rule shapes keep it easy to extend and test:
- **Path rules** flag a whole file (migrations, auth, payments, CI/infra,
  dependency manifests, committed `.env`, deleted test files) and point at its
  first changed line.
- **Line rules** run over the parsed patch with real old/new line numbers
  (destructive SQL/ORM drops, irreversible migrations, key-like strings,
  skipped or removed tests). Consecutive matching lines become one flag, capped
  at 3 per rule per file.

Path matching splits paths into words (including camelCase), so `LoginForm.tsx`
counts as auth but `author/` doesn't. Lockfiles, generated, vendored and
snapshot files skip all rules and are greyed out in the panel. The same
classification will tell the LLM step what not to read.

Every rule miss found on a real PR becomes a regression test first. The
first was discourse#29187: `db/post_migrate/` and Discourse's `ColumnDropper`.

## 2026-10-19: Jump-to-line needs the content script after all

GitHub's Files tab has a stable anchor per line, `#diff-<sha256(path)>R<n>`
(`L<n>` for the old side), but it doesn't scroll to it on load or on a hash
change. It also renders diffs lazily, so the target moves as content above it
appears. The content script finds the line by that id, re-scrolls until it's
on screen and stopped moving, then highlights the row. It depends only on
GitHub's anchor ids, not on their markup. The panel messages the content script
when the tab is already on Files and navigates there otherwise.

## 2026-10-19: LLM analysis is a separate, slower endpoint

`/api/prs/:o/:r/:n` returns PR data and rule flags in about a second, and
`/analysis` runs the LLM. The panel requests both at once, so the reviewer has
something useful immediately and the summary fills in when it's ready.
`/analysis` fetches from GitHub again; caching (milestone 5) removes the
duplicate work.

## 2026-10-19: Map/reduce with numbered diff lines, validated with Zod

- **Map:** files go to the model in chunks of up to ~16k characters (~4k
  tokens, small enough for free-tier per-minute limits), at most 8 chunks per
  PR. Every diff line is prefixed with its reference (`R12`, `L7`) and each
  file carries its rule flags. The model returns a role, summary and up to 3
  concerns per file.
- **Reduce:** the per-file notes, description, commits and linked issues
  become the summary ("what" and "why"), areas, and a review order.
- **Budget:** lockfiles and generated files are never sent. When a PR exceeds
  the budget, flagged files go in first, then source, tests and docs. Anything
  left out is listed in the panel as "not fully read".
- **Validation:** every reply is parsed with Zod. A reply that fails, or that
  leaves out a file, gets one retry with the error in the prompt, then the next
  provider. A line the model cites must exist in the diff it was shown;
  otherwise the concern stays but loses its line link, so a made-up line never
  becomes a wrong link. The review order keeps only real paths and appends any
  the model forgot, by role.

## 2026-10-19: Provider cooldowns are per Worker isolate for now

Rate-limit cooldowns live in memory. A fresh isolate doesn't know a provider is
cooling down and finds out from its next 429, which costs one wasted request.
Moving cooldowns to KV is cheap if that waste shows up in practice.

Watch at deploy time: the Workers free plan caps subrequests per request (GitHub
pages + up to 8 map calls with retries + reduce). The chunk cap keeps a normal PR
well under it, but a huge PR with many retries could get close.

## 2026-10-19: Provider chain tuned from measured free-tier behavior

Measured with real keys on 2026-10-19:
- **Groq** (`openai/gpt-oss-120b`): about 0.4s per call, but only 8,000 tokens
  per minute, counted **per model**. `max_tokens` doesn't count against it;
  tokens actually used do.
- **Gemini** (`gemini-3.8-flash`; `2.5-flash` returns 404 for new keys): most
  calls returned 503 "high demand", and the rest took about 60s.

What changed as a result:
- **Order:** Groq gpt-oss-120b, then Groq gpt-oss-20b (its own 8k/min quota on
  the same account), then Gemini, then OpenRouter. Qwen on Groq was left out:
  it has an extra output-tokens-per-minute cap that rejected normal requests.
- **Waiting beats switching:** a 429 that resets within 20s is waited out on
  the same provider instead of falling through to a 60s Gemini call. Groq's
  `retry-after` header can say 1s when the real wait is longer, so the "try
  again in 6.18s" in its message takes priority.
- **Timeouts aren't retried** (they already cost 60s). Both 5xx and timeouts
  cool the provider down for 30s, so later chunks skip it.
- **Map calls run one at a time.** One chunk uses most of a Groq model's
  minute, so parallel calls only bought 429s.
- **Groq quirks:** its `json_validate_failed` 400 counts as bad output (one
  retry); its 429 "Request too large" counts as a bad request (waiting won't
  help).
- **Panel:** low-severity LLM concerns are dropped (they were style remarks),
  and an LLM concern on the same line as a rule flag shows as a note under it.

Result: discourse#29187 in ~2.5s, and the 17-file discourse#28119 in ~13s, both
on Groq. That PR failed after 120s before these changes.

## 2026-10-19: Cache in Cloudflare KV, keyed by head commit and version

**What's cached:** two entries per PR head, `details:` (paginated commits,
files, linked issues and rule flags) and `analysis:` (the LLM output). The
cheap PR metadata call is never cached: it gives the head SHA that picks the
cache entry, and title, description and merged state can change without a new
commit.

**Why KV over D1/Supabase:** the access pattern is exactly "get by key", with
no queries, joins or migrations. It's free, sits next to the Worker, and needs
no account for local dev. The original Postgres tables (`pr_analysis`,
`risk_flag`) would only be read back as one blob anyway. A relational DB comes
back when something needs queries (custom rules in v2).

**Keys** carry a version number (`ANALYSIS_VERSION`, `PR_DETAILS_VERSION`).
Changing a prompt or rule means bumping the number, so old entries stop
matching instead of being served stale. Owner and repo are lowercased because
GitHub URLs are case-insensitive.

**Only public repos are cached.** The cache is shared by everyone using the
backend, so a private PR's analysis must never be served to someone without
access. Private repos (v2) are simply uncached until per-user access checks
exist.

**Failures:** a failed analysis is never cached, and a failed Re-run leaves
the earlier entry in place; the panel keeps showing it with a note. KV errors
(e.g. the free plan's 1,000 writes a day) are logged and treated as a miss.

**Measured locally:** a 17-file PR took 23s uncached and 0.43s cached; the
remaining time is the one GitHub metadata call.

**Known gap:** two reviewers opening the same uncached PR at once both run the
model. Fine at this scale. A short "in progress" KV marker would fix it.
