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

## 2026-10-19: Side panel is enabled per tab, opened from the toolbar

`chrome.sidePanel.open()` only works from a user gesture, so the panel can't open
by itself when a PR loads. The service worker enables the panel only on PR tabs,
and clicking the toolbar icon opens it (`openPanelOnActionClick`).

## 2026-10-19: PR detection in the service worker, not a content script

GitHub navigates client-side (no full page loads), so a content script injected
on one page doesn't re-run when you move to a PR. `chrome.tabs.onUpdated` fires on
every URL change, including history API navigation, so the service worker sees
them all. The content script is kept for DOM work like scrolling to a line.
