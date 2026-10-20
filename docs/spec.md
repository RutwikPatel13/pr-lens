# PR Lens spec

The product plan, moved out of CLAUDE.md so CLAUDE.md can stay short. Architecture and
the reasoning behind each choice are in the README and `docs/decisions.md`.

## What and who

A Chrome extension that adds a side panel to GitHub pull request pages. When a reviewer
opens a PR, the panel explains what changed, points to the risky parts, suggests an order
to read the files in, and (v2) helps draft review comments.

The audience is the person reviewing the PR. Nothing gets posted to GitHub unless the
reviewer clicks to post it. That's the main difference from GitHub Copilot PR summaries
and CodeRabbit, which add bot comments to the PR for everyone.

Solo portfolio project: it should work end to end on public repos, and every design
decision should be easy to explain in an interview.

## MVP (milestones 1–6, done)

1. Detect PR pages (`github.com/<owner>/<repo>/pull/<number>`) and show the PR in the side
   panel. Chrome only opens the panel from a user gesture (toolbar icon or Alt+Shift+P);
   once open it stays open across tabs.
2. Fetch PR data through the GitHub API: title, description, commits, changed files with
   patches, linked issues.
3. Plain-English summary: what changes, the likely reason, which parts of the system.
4. Risk flags linking to the exact file and line on the PR page.
5. Suggested review order: schema and migrations, then core logic, API, UI, tests.
6. Cache by head commit SHA so reopening a PR is instant and costs nothing.
7. Auth with a fine-grained GitHub token pasted into the extension. Public repos only.

Milestones: (1) extension scaffold, (2) GitHub fetch through the backend, (3) rule-based
risk flags with jump-to-line, (4) LLM summary and review order with map/reduce, (5)
caching, (6) polish: loading and error states, settings, README and demo.

## Version 2 (one at a time)

- GitHub OAuth so private repos work without a pasted token. Needs per-user access checks
  before private PRs can be cached, and a look at whether free LLM tiers may use the data.
- Draft review comments: select a hunk, ask "what could break here?", edit, post with one click.
- Ask the PR: free-form questions; the backend pulls extra file context from the repo.
- Custom rules per user or team, e.g. "always flag anything under billing/".
- GitLab merge request support.

The backend is deployed on Cloudflare Workers (free plan). Publishing the extension to the
Chrome Web Store is optional and not done: it needs a developer account and a listing, and
its store ID would need adding to `ALLOWED_EXTENSION_IDS`.

## How to demo

Open a PR from `docs/demo-prs.md`, open the panel, and walk through the summary, a risk
flag (click it to jump to the line), and the review order. Keep adding real PRs where it
caught something useful, like a migration with no rollback or a removed test.
