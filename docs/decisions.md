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
