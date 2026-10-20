# Chrome Web Store listing

Everything to paste into the [developer dashboard](https://chrome.google.com/webstore/devconsole/).
Images are in this folder.

## Package

```bash
PATH=/opt/homebrew/opt/node@24/bin:$PATH npm run package -w extension
```

Builds the extension and writes `extension/pr-lens-<version>.zip` (git-ignored), with the
manifest's `key` removed: the store assigns its own extension ID to an upload.

## Store listing tab

**Name:** PR Lens

**Summary** (126 of 132 characters):
Review GitHub pull requests faster: a summary, a review order, risk flags that jump to the line, and answers about the change.

**Category:** Developer Tools · **Language:** English

**Description:**

PR Lens adds a side panel for reviewing GitHub pull requests. Click the PR Lens button on any pull request to see:

• A plain-English summary: what the PR changes and the likely reason, from its description, commits and linked issues.
• A suggested review order: migrations and schema first, then core logic, then API and UI, then tests.
• Risk flags that jump to the exact line: migrations, destructive drops, migrations that can't be rolled back, auth and payment code, CI config, new dependencies, possible secrets, deleted or skipped tests. Click one and the page scrolls to the line.
• Ask the PR: questions like "does anything still read this column?", answered from the diff, the files and code search, with links to the sources.
• Suggested replies to review threads, ready to edit and paste.
• Your own rules: flag paths or code patterns that matter to you, with a live preview.

PR Lens never posts to GitHub. It's for the person reviewing.

Works on public repositories with a GitHub fine-grained token (read-only, public repositories). AI features use third-party providers; see the privacy policy for what is sent where.

**Screenshots** (1280×800): `screenshot-1-overview.png`, `screenshot-2-jump-to-line.png`,
`screenshot-3-ask.png`, `screenshot-4-suggested-reply.png`, `screenshot-5-custom-rule.png`

**Small promo tile** (440×280, required): `promo-small-440x280.png`
**Marquee promo tile** (1400×560, optional): `promo-marquee-1400x560.png`

**Website / support:** https://github.com/RutwikPatel13/pr-lens

## Privacy tab

**Single purpose:** Help a reviewer understand a GitHub pull request: summarize it, order the
files to read, flag risky lines, and answer questions about it.

**Permission justifications:**
- `sidePanel`: PR Lens's interface is a side panel shown next to the pull request.
- `storage`: saves the reviewer's GitHub token (local), settings, custom rules (sync) and the
  current Ask conversation (session).
- Host permission `https://github.com/*`: to know when the active tab is a pull request, add
  the PR Lens button to pull request pages, and scroll the diff to a flagged line.

**Remote code:** No. All code ships in the package; the backend returns data (JSON), not code.

**Data usage** (suggested answers; check against the form's current wording):
- Authentication information: **yes** (the GitHub token, sent to the PR Lens backend to read
  pull requests; not stored there).
- Website content: **yes** (pull request content is processed by the backend and AI providers).
- Web history: **yes, limited** (the backend receives which pull request you open).
- Personally identifiable information: **yes, limited** (your GitHub username, for rate limits).
- Everything else (health, financial, location, personal communications, user activity
  tracking): **no**.
- Certify: not sold to third parties; not used or transferred for purposes unrelated to the
  single purpose; not used for creditworthiness or lending.

**Privacy policy URL:** https://github.com/RutwikPatel13/pr-lens/blob/main/docs/privacy.md

## After the upload

1. On the item's **Package** tab, click **View public key** and copy it.
2. Replace `"key"` in `extension/manifest.json` with it, so local builds get the store's ID.
3. Put the store's extension ID in `ALLOWED_EXTENSION_IDS` (`backend/wrangler.jsonc`) and
   redeploy: `npm run deploy -w backend`. Until then, the backend's CORS blocks the store version.
4. Submit for review.
