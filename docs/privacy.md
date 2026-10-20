# PR Lens privacy policy

Effective October 20, 2026.

PR Lens is a Chrome extension that helps you review GitHub pull requests. This page explains
what data it handles, where that data goes, and how long it's kept. PR Lens has no ads, no
analytics or tracking, and does not sell or share data except as described here.

## What stays in your browser

- **Your GitHub token**, in Chrome's local extension storage on this device. It's never synced
  to your Google account.
- **Your settings**: the backend address and theme (local storage), and your custom rules and
  switched-off rule categories (Chrome sync storage, which follows your Chrome profile to your
  other devices if you use Chrome sync).
- **Ask conversations**, in Chrome's session storage, cleared when the browser closes.

## What is sent to the PR Lens backend

The extension talks to one backend, hosted on Cloudflare Workers. With each request it sends:

- **Your GitHub token**, so the backend can read the pull request from GitHub on your behalf.
  The token is used for that request only. It is never stored or logged.
- **Which pull request** you're looking at (owner, repository and number), when you open the
  panel or a pull request page (for the risk count on the PR Lens button).
- **What you ask**: your questions in the Ask tab, the recent turns of that conversation, and
  which review thread you want a suggested reply for.

Your custom rules are not sent: they run inside the extension.

## What the backend keeps

- **Cached results, for public repositories only, for up to 30 days**: pull request details
  (files, diffs, commits, linked issues), rule-based risk flags, AI summaries, answers to the
  first question in a conversation, and suggested replies. These are keyed by repository, pull
  request and commit, and are shared with other users who open the same public pull request.
  Nothing about private repositories is cached.
- **A usage count per GitHub user, for 2 days**, to limit how many AI requests one person can
  make. It stores your GitHub username and the number of requests that day and hour. To find
  your username, the backend asks GitHub; it remembers the answer in memory only, under a
  one-way hash of your token, never the token itself.
- **Error logs**: when something fails, the backend logs the error, which can include the
  repository and pull request it was working on. Cloudflare keeps these logs for a few days.

## Third parties

To do its job, PR Lens sends data to:

- **GitHub** (github.com, api.github.com): to read pull requests, files, comments and code
  search results, using your token. See [GitHub's privacy statement](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement).
- **Cloudflare**: hosts the backend and its cache. See [Cloudflare's privacy policy](https://www.cloudflare.com/privacypolicy/).
- **AI providers: Groq and Google (Gemini)**: to write summaries, answers and suggested replies,
  the backend sends them parts of the pull request (title, description, diffs, file excerpts,
  code search results, review comments) and your question. PR Lens uses their free tiers.
  Google's terms for unpaid Gemini API use say Google uses the content submitted, and the
  responses, to provide and improve its products. Groq handles requests under its own privacy
  policy. Don't use PR Lens on code you aren't allowed to share with these providers. See
  [Google's Gemini API terms](https://ai.google.dev/gemini-api/terms) and
  [Groq's privacy policy](https://groq.com/privacy-policy/).

## What the extension does on github.com

On github.com, PR Lens adds a "PR Lens" button to pull request pages and, when you click a risk
flag, scrolls the page to that line. It reads the page's address to know which pull request
you're on, and looks for GitHub's header and line markers to place the button and scroll. It
doesn't read or collect anything else from the pages you visit.

## Your choices

- Remove your token at any time in PR Lens's settings, or uninstall the extension to remove
  everything it stored in your browser.
- Cached results expire on their own within 30 days. To ask for earlier removal of cached
  results about a pull request, open an issue at
  [github.com/RutwikPatel13/pr-lens](https://github.com/RutwikPatel13/pr-lens/issues).

## Chrome Web Store user data policy

The use of information received from Google APIs and Chrome will adhere to the
[Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq),
including the [Limited Use](https://developer.chrome.com/docs/webstore/program-policies/limited-use) requirements. Data is used only to provide PR Lens's features
described above, and is not used for advertising, sold, or transferred for other purposes.

## Changes and contact

If this policy changes, the new version will be posted here with a new effective date.
Questions: open an issue at [github.com/RutwikPatel13/pr-lens](https://github.com/RutwikPatel13/pr-lens/issues).
