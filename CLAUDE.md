# CLAUDE.md

## Project

PR Lens is a Chrome extension for reviewing GitHub pull requests. A "PR Lens" button in the PR
header opens a side panel with a summary, a review order, risk flags that jump to the line
(built-in rules, the reviewer's own rules, AI), Ask the PR, and suggested replies to review
threads. It never posts to GitHub. A Hono backend on Cloudflare Workers fetches the PR, runs
the rules and free LLM tiers, and caches by head commit. Solo portfolio project: plan in
`docs/spec.md`, reasoning in `docs/decisions.md`.

## Stack

- TypeScript (strict) everywhere, Node 24 (`.nvmrc`), npm workspaces. npm only, never pnpm or yarn.
- Extension: Manifest V3, React 19, Vite 8 + CRXJS, Tailwind v4
- Backend: Hono on Cloudflare Workers (wrangler), Zod, KV for cache and quotas
- LLM: Groq and Gemini free tiers behind `LlmProvider` with fallback; no SDKs, plain `fetch`

## Layout

```
extension/src/
  background/   service worker: panel only on PR tabs, opens it for the in-page button,
                fetches the button's risk count (content scripts can't: CORS)
  content/      on github.com: the PR Lens button (header slot, else floating), scroll-to-line
  sidepanel/    panel UI (Overview / Ask / Discussion tabs), Settings, hooks
  options/      extension options page, renders sidepanel/Settings
  lib/          api client, storage modules, GitHub anchors, Markdown subset, messages
backend/src/
  routes/prs.ts /api/prs/:o/:r/:n with X-GitHub-Token: GET, GET analysis, POST ask,
                GET threads, POST threads/suggest-reply
  pr-service.ts GitHub fetch + KV cache orchestration
  github/ risk/ llm/ ask/ cache/   client, rule engine, map/reduce summary, Ask, cache keys
  quota.ts      per-user AI request limits
backend/tests/  mirrors src/; tests/shared covers shared/src
shared/src/     API types (index.ts); diff parsing and custom rules, used by both sides
docs/           spec, decisions, demo PRs, README images
```

## Commands

Run from the repo root.

```bash
npm install
npm run dev -w backend           # wrangler dev, http://localhost:8787; keys in backend/.dev.vars
npm run build -w extension       # typecheck + build to extension/dist (load unpacked in Chrome)
npm run dev -w extension         # vite + CRXJS with HMR, talks to localhost:8787
npm test -w backend              # vitest; one file: npm test -w backend -- tests/quota.test.ts
npm run typecheck -w backend     # wrangler types, then tsc
npm run typecheck -w extension
npm run deploy -w backend        # https://pr-lens-backend.pr-lens-backend.workers.dev
npm run package -w extension     # Chrome Web Store zip, manifest "key" removed (docs/store/listing.md)
(cd backend && printf '%s' "$VALUE" | npx wrangler secret put GROQ_API_KEY)   # set/rotate a secret
```

Run the backend tests and both typechecks before telling me a change is done. After a
manifest change, reload the extension in chrome://extensions.

---

## Conventions

- Strict TS plus `noUncheckedIndexedAccess`. No `any`; use `unknown` and narrow.
- Named exports; default export only for the Worker's `app` (`backend/src/index.ts`).
- API types in `shared/src/index.ts`; everything else next to its code.
- GitHub and LLM JSON gets narrow types naming only the fields read, cast once at the fetch.
  Model output always goes through Zod, and anything the model cites must exist in what it saw.
- Errors: throw typed errors (`GitHubError`, `LlmError`, `QuotaExceededError`...) and map them to
  API error codes in `app.onError`. No empty catch; a deliberate fallback gets a comment.
- `async/await`; a single `.then` only where `await` can't go (React effects, onMessage callbacks).
- React function components and hooks, Tailwind inline. Colors only via the theme tokens in
  `sidepanel/index.css` (`bg-canvas`, `text-muted`, `border-line`...), never `text-gray-500`,
  or dark mode breaks. Shared pieces live in `sidepanel/ui.tsx`.
- The panel reaches the backend only via `lib/api.ts`, and `chrome.storage` only via the
  `lib/` storage modules (`settings`, `rules-storage`, `theme`, `conversation`).
- Comments explain why, not what. Measured facts (free-tier limits, GitHub quirks) get a date.

## Testing

- Vitest in the backend workspace, covering backend and `shared/`. The extension UI is checked
  in a scripted browser, not unit-tested.
- LLM tests use `FakeProvider` (`backend/tests/llm/fakes.ts`); never call a real provider.
- When a rule misses (or wrongly flags) something on a real PR, add that case to the
  "real PRs" block in `backend/tests/risk/engine.test.ts` first, then fix the rule.
- Bug fixes get a test that fails before the fix. Don't change assertions to make a test pass.

## Things that will bite you

- This machine's default `node` is 20.11, too old for Vite 8: put `/opt/homebrew/opt/node@24/bin`
  first on PATH. `npm run <x> -w <ws>` only works from the repo root.
- Production builds target the deployed backend, dev builds localhost:8787; a production
  build can point elsewhere in Settings.
- The manifest `key` fixes the extension ID, and CORS allows only `ALLOWED_EXTENSION_IDS`.
  Remove the key and the panel gets blocked.
- `VITE_*` vars are bundled into the extension: never secrets. Keys live in `backend/.dev.vars`,
  the e2e GitHub token in `.env.test` (both git-ignored).
- Cached results go stale unless you bump the version in `backend/src/cache/keys.ts`:
  `ANALYSIS_VERSION` (summary prompts, chunking, models), `PR_DETAILS_VERSION` (risk rules,
  stored GitHub fields), `ASK_VERSION` / `REPLY_VERSION` (their prompts or shapes).
- Chrome opens the side panel only from a user gesture. Our button click counts, but only if
  the service worker calls `sidePanel.open()` with nothing awaited before it.
- GitHub markup changes: the button's `HEADER_SLOTS` (`content/open-button.ts`) may need
  updating (it floats meanwhile). GitHub navigates client-side, so content scripts don't
  re-run; PR detection uses `chrome.tabs` events. Line anchors are `#diff-<sha256(path)>R<n>`,
  which GitHub doesn't scroll to itself, hence the content script's retries.
- Free LLM tiers (measured 2026-10-19): Groq allows 8k tokens a minute per model; Gemini's free
  tier is often overloaded. Check each provider's model list before changing default models.
- Repo text and comments go into prompts only through `untrusted()` (`backend/src/ask/prompts.ts`).
- `backend/worker-configuration.d.ts` is generated and git-ignored; `typecheck` regenerates it.
- Scripted browser checks: save test settings from an extension page, not the service worker
  (it can start before `chrome.storage` exists), and don't `type()` into a background tab.

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
- Keep the README, `docs/demo-prs.md` and `docs/privacy.md` current when behavior changes:
  the privacy policy must match what data is sent and kept.
- If something in this file is unclear or seems wrong, ask instead of guessing.

## Don't

- Don't push or open PRs unless I ask.
- Don't modify `.env*`, `.dev.vars`, CI config, or anything in `.github/` without asking.
- Don't disable a type check or add `@ts-expect-error` to make an error go away. Fix the
  cause or tell me it's not fixable.
- Don't put secrets in the extension bundle, in commits, or in chat output.
