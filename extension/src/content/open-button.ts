import type { PrRef } from '@pr-lens/shared';
import type { OpenPanelMessage, RiskCountsRequest, RiskCountsResponse } from '../lib/messages';
import { parsePrUrl } from '../lib/pr-url';

// The "PR Lens" button on PR pages. It sits with the PR's action buttons in GitHub's header;
// if GitHub's markup changes and no slot is found, it floats in the bottom-right corner
// instead, so there is always a way to open the panel.

const HOST_ID = 'pr-lens-open-button';

// Where GitHub's PR pages keep their action buttons (checked 2026-10-20). The Conversation tab
// uses Primer's React PageHeader; the Files tab still uses the classic header.
const HEADER_SLOTS = ['[data-component="PH_Actions"]', '.gh-header-actions'];

const counts = new Map<string, RiskCountsResponse>();
const prKey = (pr: PrRef) => `${pr.owner}/${pr.repo}#${pr.number}`.toLowerCase();

// GitHub's own theme (data-color-mode is "light", "dark" or "auto"), so the button matches the page.
function githubTheme(): 'light' | 'dark' {
  const mode = document.documentElement.dataset.colorMode;
  if (mode === 'light' || mode === 'dark') return mode;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// Shadow DOM keeps GitHub's CSS off the button and ours off the page. Colors match the panel.
const STYLE = `
  :host { display: inline-flex; }
  :host([data-mode='floating']) { position: fixed; right: 20px; bottom: 20px; z-index: 2147483000; }
  button {
    display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 10px;
    border-radius: 6px; border: 1px solid var(--line); background: var(--control); color: var(--fg);
    font: 600 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
    cursor: pointer; white-space: nowrap;
  }
  button:hover { background: var(--hover); border-color: var(--line-strong); }
  button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  :host([data-mode='floating']) button {
    height: 44px; padding: 0 14px; border-radius: 999px; font-size: 13px;
    box-shadow: 0 8px 24px var(--shadow), 0 1px 3px var(--shadow);
  }
  .badge { padding: 0 6px; border-radius: 999px; font-size: 11px; border: 1px solid transparent; }
  .high { background: var(--high-bg); color: var(--high-fg); border-color: var(--high-line); }
  .medium { background: var(--medium-bg); color: var(--medium-fg); border-color: var(--medium-line); }
  .none { color: var(--muted); font-weight: 400; }
  .checking { width: 30px; height: 8px; border-radius: 4px; background: var(--inset); }
  :host([data-theme='light']) {
    --fg: #1f2328; --muted: #59636e; --control: #f6f8fa; --hover: #eff2f5; --line: #d1d9e0;
    --line-strong: #afb8c1; --inset: #e6eaef; --focus: #0969da; --shadow: rgba(31, 35, 40, 0.14);
    --high-bg: #ffebe9; --high-fg: #a40e26; --high-line: #ffcecb;
    --medium-bg: #fff8c5; --medium-fg: #7d4e00; --medium-line: #f5e0a0;
  }
  :host([data-theme='dark']) {
    --fg: #f0f6fc; --muted: #9198a1; --control: #212830; --hover: #262c36; --line: #3d444d;
    --line-strong: #656c76; --inset: #3d444d; --focus: #4493f8; --shadow: rgba(1, 4, 9, 0.6);
    --high-bg: #3c1e1e; --high-fg: #ffa198; --high-line: #6e2b2b;
    --medium-bg: #33290f; --medium-fg: #e3b341; --medium-line: #5c4813;
  }
`;

const LENS_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M21 21l-4.3-4.3"></path></svg>';

function renderBadge(host: HTMLElement): void {
  const badge = host.shadowRoot?.querySelector('[data-badge]');
  const button = host.shadowRoot?.querySelector('button');
  if (!(badge instanceof HTMLElement) || button === null || button === undefined) return;

  const state = counts.get(host.dataset.pr ?? '');
  badge.className = 'badge';
  badge.textContent = '';
  let label = 'Open PR Lens';
  if (state === undefined) {
    badge.className = 'checking';
  } else if (state.status === 'ok' && state.high > 0) {
    badge.classList.add('high');
    badge.textContent = `${state.high} high`;
    label += `, ${state.high} high-risk changes`;
  } else if (state.status === 'ok' && state.medium > 0) {
    badge.classList.add('medium');
    badge.textContent = `${state.medium} medium`;
    label += `, ${state.medium} medium-risk changes`;
  } else if (state.status === 'ok') {
    badge.classList.add('none');
    badge.textContent = 'no flags';
  } else {
    badge.hidden = true;
  }
  button.setAttribute('aria-label', label);
}

function createHost(pr: PrRef, mode: 'header' | 'floating'): HTMLElement {
  const host = document.createElement('span');
  host.id = HOST_ID;
  host.dataset.pr = prKey(pr);
  host.dataset.mode = mode;
  host.dataset.theme = githubTheme();

  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = STYLE;
  const button = document.createElement('button');
  button.type = 'button';
  button.title = 'Open the review panel (Alt+Shift+P)';
  button.innerHTML = `${LENS_ICON}<span>PR Lens</span><span data-badge></span>`;
  button.addEventListener('click', () => {
    // Sent from the click handler so Chrome treats the panel opening as user-initiated.
    const message: OpenPanelMessage = { type: 'pr-lens/open-panel' };
    void chrome.runtime.sendMessage(message);
  });
  shadow.append(style, button);
  renderBadge(host);
  return host;
}

async function loadCounts(pr: PrRef): Promise<void> {
  const key = prKey(pr);
  if (counts.has(key)) return;
  const request: RiskCountsRequest = { type: 'pr-lens/risk-counts', pr };
  const response = (await chrome.runtime.sendMessage(request)) as RiskCountsResponse | undefined;
  counts.set(key, response ?? { status: 'unavailable' });
  const host = document.getElementById(HOST_ID);
  if (host !== null && host.dataset.pr === key) renderBadge(host);
}

// Puts the button in the right place for the current URL. Runs on every DOM change (GitHub
// navigates client-side and its React header can re-render and drop the button), so the
// common case, button already in place, returns immediately.
function sync(): void {
  const pr = parsePrUrl(window.location.href);
  const existing = document.getElementById(HOST_ID);
  if (pr === null) {
    existing?.remove();
    return;
  }

  // Only a slot that's actually on screen: GitHub keeps the header's actions container in the
  // page but hides it when there are no actions (e.g. logged out) and at some widths.
  const slot =
    HEADER_SLOTS.flatMap((selector) => [...document.querySelectorAll(selector)]).find((el) => el.getClientRects().length > 0) ??
    null;
  const mode = slot === null ? 'floating' : 'header';
  if (
    existing !== null &&
    existing.dataset.pr === prKey(pr) &&
    existing.dataset.mode === mode &&
    (slot === null || existing.parentElement === slot)
  ) {
    return;
  }

  existing?.remove();
  const host = createHost(pr, mode);
  if (slot === null) document.body.append(host);
  else slot.prepend(host);
  void loadCounts(pr);
}

export function startOpenButton(): void {
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      sync();
    });
  };
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('popstate', schedule);
  // The visible slot can change with the window width.
  window.addEventListener('resize', schedule);
  sync();
}
