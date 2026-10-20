# CLAUDE.md

## Project

PR Lens is a Chrome extension with a side panel for GitHub pull requests: a plain-English
summary, a suggested review order, and risk flags that jump to the exact line. It's for the
person reviewing the PR and never posts to GitHub. A Hono backend on Cloudflare Workers
fetches the PR, runs a rule engine, and calls free LLM tiers (map/reduce over the diff),
caching by head commit. Solo portfolio project: product plan and v2 in `docs/spec.md`,
design reasoning in `docs/decisions.md`.

## Stack

- TypeScript (strict) everywhere, Node 24 (`.nvmrc`), npm workspaces
- Extension: Manifest V3, React 19, Vite 8 + CRXJS, Tailwind v4
- Backend: Hono on Cloudflare Workers (wrangler), Zod, KV for the cache
- LLM: Groq and Gemini free tiers (OpenRouter optional) behind `LlmProvider`; no SDKs, plain `fetch`
- Package manager: npm. Never pnpm or yarn.

## Layout

```
extension/src/
  background/     service worker: toolbar icon / Alt+Shift+P opens the panel
  sidepanel/      panel UI, settings, hooks (useActivePr follows the active tab's URL)
  options/        extension options page, renders sidepanel/Settings
  content/        on github.com: scrolls the Files tab to a line and highlights it
  lib/            api client, settings storage, GitHub anchor links, messages
backend/src/
  routes/prs.ts   GET /api/prs/:o/:r/:n (PR + rule flags), .../analysis (LLM)
  pr-service.ts   GitHub fetch + cache + analysis orchestration
  github/         REST + GraphQL client
  risk/           rule engine: patch parsing, path words, rules
  llm/            chunking, prompts, schemas, providers/, fallback chain, pipeline
  cache/          KV JSON cache and versioned keys
backend/tests/    mirrors src/
shared/src/index.ts   every type that crosses the API
docs/             spec, decisions, demo PRs, README images
```

## Commands

Run from the repo root.

```bash
npm install
npm run dev -w backend           # wrangler dev, http://localhost:8787; keys in backend/.dev.vars
npm run build -w extension       # typecheck + build to extension/dist (load unpacked in Chrome)
npm run dev -w extension         # vite + CRXJS with HMR
npm test -w backend              # vitest
npm test -w backend -- tests/risk/engine.test.ts
npm run typecheck -w backend     # wrangler types, then tsc
npm run typecheck -w extension
npm run deploy -w backend        # live at https://pr-lens-backend.pr-lens-backend.workers.dev
(cd backend && printf '%s' "$VALUE" | npx wrangler secret put GROQ_API_KEY)   # set/rotate a secret
```

Run the backend tests and both typechecks before telling me a change is done. After a
manifest change, the extension must be reloaded in chrome://extensions.

---

## Conventions

- Strict TS plus `noUncheckedIndexedAccess`. No `any`; use `unknown` and narrow.
- Named exports. Default export only where required (the Worker's `app` in `backend/src/index.ts`).
- Types that cross the API live in `shared/src/index.ts`. Everything else sits next to its code.
- GitHub and LLM JSON is typed with narrow types naming only the fields we read
  (`GhPull`, `GeminiResponse`), cast once at the fetch. Model output goes through Zod.
- Errors: throw typed errors (`GitHubError`, `LlmError`, `AllProvidersFailedError`) and map
  them to API error codes in `app.onError`. No empty catch; a deliberate fallback gets a comment.
- `async/await`. A single `.then` is fine where `await` can't go: React effects and the
  `chrome.runtime.onMessage` callback.
- React function components and hooks. Tailwind classes inline.
- The panel talks to the backend only through `extension/src/lib/api.ts`, and to
  `chrome.storage` only through `lib/settings.ts`.
- Comments explain why, not what. Measured facts (free-tier limits, GitHub quirks) get a date.

## Testing

- Vitest, backend only: risk engine, chunking, fallback chain, pipeline, cache service.
  UI is checked in a scripted browser, not unit-tested.
- LLM tests use `FakeProvider` (`backend/tests/llm/fakes.ts`); never call a real provider in tests.
- When a rule misses (or wrongly flags) something on a real PR, add that case to the
  "real PRs" block in `backend/tests/risk/engine.test.ts` first, then fix the rule.
- Bug fixes get a test that fails before the fix. Don't change assertions to make a test pass.

## Things that will bite you

- This machine's default `node` is 20.11, too old for Vite 8. Use Node 24:
  `/opt/homebrew/opt/node@24/bin` first on PATH.
- `npm run <x> -w <workspace>` only works from the repo root.
- `npm run build -w extension` targets the deployed backend; `npm run dev -w extension` targets
  localhost:8787. Testing a local backend with a production build means changing it in Settings.
- The manifest `key` fixes the extension ID, and the backend's CORS allows only the IDs in
  `ALLOWED_EXTENSION_IDS`. Remove the key and the panel gets blocked.
- In zsh scripts, never name a variable `path`: it overwrites `$PATH`.
- `VITE_*` env vars are bundled into the extension. Never put a secret in one. API keys
  live in `backend/.dev.vars` (git-ignored); the e2e GitHub token is in `.env.test` (git-ignored).
- Changing prompts, chunking, models or `PrAnalysis` means bumping `ANALYSIS_VERSION`; risk
  rules or stored GitHub fields mean `PR_DETAILS_VERSION` (`backend/src/cache/keys.ts`).
  Otherwise stale cached results are served.
- Chrome won't open the side panel without a user gesture. Don't try to auto-open it.
- GitHub navigates client-side: content scripts don't re-run between pages. PR detection
  uses `chrome.tabs` events.
- GitHub line anchors are `#diff-<sha256(path)>R<n>` (`L<n>` for the old side). GitHub
  doesn't scroll to them itself and renders diffs lazily, hence the content script's retries.
- Free LLM tiers (measured 2026-10-19): Groq allows 8k tokens a minute per model, Gemini's
  free tier is often overloaded (503s, ~60s calls). Re-check model IDs with each provider's
  model list before changing defaults; models get retired.
- `backend/worker-configuration.d.ts` is generated and git-ignored; `typecheck` regenerates it.
- Tailwind's `uppercase` changes `innerText`: scripted UI checks see "RISK FLAGS".

---

## How I want you to work

- Ask before installing a new dependency, and say why it's needed. Check if we already
  have something that does the job.
- Make the smallest change that solves the problem. Don't refactor adjacent code you
  weren't asked about.
- If you're guessing about an API, read the source in `node_modules` or the provider's
  docs. Don't invent method names, model IDs or endpoints.
- If a task needs more than about three files changed, outline the plan first and wait.
- Don't add defensive try/catch around things that can't fail.
- One milestone (or feature) at a time, on its own branch, in small commits with clear messages.
- When a choice has a real tradeoff (caching, chunk size, model choice), add a short note to
  `docs/decisions.md`: what was picked and why. These double as interview talking points.
- Keep the README and `docs/demo-prs.md` current when behavior changes.
- If something in this file is unclear or seems wrong, ask instead of guessing.

## Don't

- Don't push or open PRs unless I ask.
- Don't modify `.env*`, `.dev.vars`, CI config, or anything in `.github/` without asking.
- Don't disable a type check or add `@ts-expect-error` to make an error go away. Fix the
  cause or tell me it's not fixable.
- Don't put secrets in the extension bundle, in commits, or in chat output.
