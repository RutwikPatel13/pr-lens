# PR Lens (working name)

A Chrome extension that adds a side panel to GitHub pull request pages. When a reviewer opens a PR, the panel explains what changed, points to the risky parts, suggests an order to read the files in, and helps draft review comments.

The audience is the person reviewing the PR. Nothing gets posted to GitHub unless the reviewer clicks to post it. That is the main difference from tools like GitHub Copilot PR summaries and CodeRabbit, which add bot comments to the PR for everyone.

This is a solo portfolio project. It should work end to end on public repos early, and every design decision should be easy to explain in an interview.

## Features

### MVP

1. Detect when the current tab is a PR page (`github.com/<owner>/<repo>/pull/<number>`) and show it in the side panel. Chrome only lets the panel open from a user gesture (toolbar icon or Alt+Shift+P). Once open it stays open across tabs and fills in whenever the active tab is a PR.
2. Fetch the PR data through the GitHub API: title, description, commits, changed files, diff, and linked issues.
3. Plain-English summary: what the PR changes, the likely reason (from the title, description, commits and linked issue), and which parts of the system it touches.
4. Risk flags: highlight files and hunks that need a closer look. Each flag links to the exact file and line on the PR page.
5. Review order: suggest which files to read first. Example: schema and migrations, then services, then UI, then tests.
6. Cache results by head commit SHA so reopening the same PR is instant and costs nothing.
7. Auth with a GitHub fine-grained personal access token pasted into the extension settings. Public repos only.

### Version 2

- GitHub OAuth so private repos work without pasting a token.
- Draft review comments: select a hunk, ask "what could break here?", get an editable comment, and post it with one click.
- Ask the PR: free-form questions like "where is this function called?" The backend pulls extra file context from the repo through the API to answer.
- Custom rules per user or team, for example "always flag anything under billing/".
- GitLab merge request support.

## Architecture

```
Chrome extension (Manifest V3)
  service worker   -> opens the panel from the toolbar icon / shortcut
  side panel       -> React + TypeScript UI; follows the active tab's URL
                      (tabs.onUpdated, so GitHub's client-side navigation is
                      seen) and calls the backend directly
  content script   -> scrolls the Files tab to a flagged line and highlights it

Backend API (Node + TypeScript + Hono, on Cloudflare Workers)
  GitHub client    -> fetches PR metadata, files, diff
  risk engine      -> cheap rule-based pass over file paths and diff content
  LLM pipeline     -> chunked summarization (see below)
  cache            -> keyed by repo + PR + head SHA

LLM providers      -> called only from the backend, never from the extension
```

PR detection uses `chrome.tabs` events, not a content script: GitHub navigates client-side, so a content script wouldn't re-run when moving between pages.

The extension never holds an LLM API key. All model calls go through the backend, which also handles caching and rate limiting.

### LLM providers: free tiers with fallback

The project runs on free LLM tiers. Every provider sits behind one `LlmProvider` interface in `backend/src/llm/providers/`, and the pipeline only talks to that interface.

- Providers are tried in a configured order (`LLM_PROVIDERS`, entries `name` or `name:model`). Default: Groq gpt-oss-120b, Groq gpt-oss-20b (separate per-model quota), Gemini, OpenRouter. Claude is an optional paid provider, not built yet.
- On a 429 that resets within 20s, wait and retry the same provider; otherwise cool it down until its reset and move on. 5xx: retry once. Timeout: no retry. Both then cool down 30s.
- Output that fails schema validation gets one retry on the same provider with the validation error, then moves on.
- Each stored analysis records which provider and model produced it.
- Use one account per provider. Never rotate multiple accounts on one provider to stretch its quota.

Use the GitHub API for PR data, not DOM scraping. GitHub changes its markup often and scraping would break. The content script only touches the DOM for small things like detecting the page and jumping to a line.

## Handling large diffs

This is the core engineering problem. A big PR won't fit in one prompt, and sending everything is slow and expensive.

1. Rule pass first, no LLM. Tag files by path and content:
   - migrations, schema files, SQL
   - auth, session, permissions, tokens
   - payments and billing
   - `.env`, config, CI files, Dockerfiles
   - dependency files (`package.json`, lockfiles, `requirements.txt`)
   - deleted or weakened tests
   - possible secrets (key-like strings)
   - generated or vendored files, lockfile noise (deprioritize these)
2. Map step: summarize each file or group of related files separately, with the rule tags included in the prompt.
3. Reduce step: combine the per-file summaries into the overall summary, risk list, and review order.
4. Skip or truncate generated files, lockfiles, and huge snapshots, and say so in the UI so the reviewer knows what wasn't read.
5. Ask the model for structured JSON output (summary, risks with file and line, review order) and validate it before rendering.

## Data model (first pass)

- `pr_analysis`: id, repo_full_name, pr_number, head_sha, summary, review_order (json), created_at
- `risk_flag`: id, analysis_id, file_path, line_start, line_end, category, severity, explanation
- `user_settings`: user_id, custom_rules (json), created_at

## Tech stack

- Node 24 (`.nvmrc`), npm workspaces. Use npm, never pnpm or yarn.
- Extension: Manifest V3, React 19, TypeScript, Vite 8 + CRXJS, Tailwind v4
- Backend: Node + TypeScript + Hono (shares types with the extension via `/shared`)
- Database: not chosen yet; decide at milestone 5 (Supabase free tier or Cloudflare D1/KV)
- LLM: free tiers behind a provider interface with fallback (see above); Claude API as the paid upgrade
- Hosting: Cloudflare Workers free tier (no cold-start sleep, runs Hono natively)
- Everything in the MVP should run at $0.

## Commands

Run from the repo root.

```bash
npm install
npm run dev -w extension         # vite + CRXJS; load extension/dist unpacked
npm run build -w extension       # typecheck + production build to extension/dist
npm run typecheck -w extension
npm run dev -w backend           # wrangler dev on http://localhost:8787; LLM keys in backend/.dev.vars (see .dev.vars.example)
npm run typecheck -w backend     # regenerates worker-configuration.d.ts, then tsc
npm test -w backend              # vitest; one file: npm test -w backend -- tests/risk/engine.test.ts
```

When a rule misses (or wrongly flags) something on a real PR, add that case to the "real PRs" block in `backend/tests/risk/engine.test.ts` before fixing the rule. Real PRs worth demoing go in `docs/demo-prs.md`.

API: `GET /api/prs/:owner/:repo/:number` (PR + rule flags, fast) and `.../analysis` (LLM, slow), both with header `X-GitHub-Token`. Errors are `{ error: { code, message } }` (types in `shared/src/index.ts`).

Load the extension: chrome://extensions → Developer mode → Load unpacked → `extension/dist`.

## Suggested repo layout

```
/extension
  /src
    /content        content script
    /sidepanel      React UI
    /background     service worker
    /lib            shared types, API client
  manifest.json
/backend
  /src
    /github         API client
    /risk           rule engine
    /llm            prompts, chunking, map/reduce
    /routes
  /tests
/shared             types shared by extension and backend
CLAUDE.md
README.md
```

## Milestones

1. Repo setup, extension scaffold that opens a side panel on PR pages and shows the PR number.
2. Backend fetches PR data from GitHub with a PAT and returns it to the panel.
3. Rule-based risk flags shown in the panel, with clickable links to lines.
4. LLM summary and review order with map/reduce for large PRs.
5. Caching by head SHA.
6. Polish: loading states, errors (bad token, rate limits, huge PRs), settings page, README with screenshots and a demo GIF.
7. Version 2 features, one at a time.

## How to demo it

Open any public PR on a well-known repo, open the panel, and walk through the summary, a risk flag, and the review order. Keep a short list of real PRs where it caught something useful, like a migration with no rollback or a removed test.

## Working agreements for Claude Code

- TypeScript strict mode everywhere on the TS side. No `any` unless there's a comment explaining why.
- Ask before adding a new dependency, and say why it's needed.
- Keep secrets out of the extension bundle. API keys live only in backend env vars.
- Write tests for the risk engine and the chunking logic. UI tests can come later.
- Small commits with clear messages. One milestone at a time.
- When a design choice has a real tradeoff (caching strategy, chunk size, model choice), write a short note in `docs/decisions.md` with what was picked and why. These notes double as interview talking points.
- If something in this file is unclear or seems wrong, ask instead of guessing.
