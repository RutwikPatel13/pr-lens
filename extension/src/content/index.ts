import { isScrollToAnchorMessage } from '../lib/messages';
import { startOpenButton } from './open-button';

// Runs on github.com. Two jobs: the "PR Lens" open button on PR pages (open-button.ts), and
// scrolling the Files tab to a diff line and highlighting it.
// GitHub renders diffs lazily, so content above the target keeps growing; we re-scroll
// until the line is on screen and has stopped moving.

const LINE_ANCHOR = /^diff-[0-9a-f]{64}(?:[LR]\d+)?$/;
const FILE_ANCHOR_LENGTH = 'diff-'.length + 64;
const ATTEMPTS = 25;
const ATTEMPT_DELAY_MS = 200;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function highlight(el: Element): void {
  const row = el.closest('tr') ?? el;
  if (!(row instanceof HTMLElement)) return;
  row.style.outline = '2px solid #f59e0b';
  row.style.outlineOffset = '-2px';
  setTimeout(() => {
    row.style.outline = '';
    row.style.outlineOffset = '';
  }, 2500);
}

function isOnScreen(rect: DOMRect): boolean {
  return rect.top >= 0 && rect.bottom <= window.innerHeight;
}

async function scrollToAnchor(anchor: string): Promise<boolean> {
  let previousTop: number | null = null;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    // Falls back to the file header when the line isn't rendered (collapsed or very large diffs).
    const el = document.getElementById(anchor) ?? document.getElementById(anchor.slice(0, FILE_ANCHOR_LENGTH));
    if (el === null) {
      await sleep(ATTEMPT_DELAY_MS);
      continue;
    }
    el.scrollIntoView({ block: 'center' });
    await sleep(ATTEMPT_DELAY_MS);
    const rect = el.getBoundingClientRect();
    // Settled: on screen and in the same place as last time. Near the top or bottom of
    // the page it can't reach the center, so "on screen" is the bar, not "centered".
    if (isOnScreen(rect) && previousTop !== null && Math.abs(rect.top - previousTop) < 2) {
      highlight(el);
      return true;
    }
    previousTop = rect.top;
  }
  return false;
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isScrollToAnchorMessage(message)) return;
  void scrollToAnchor(message.anchor).then((found) => sendResponse({ found }));
  return true; // keeps the channel open for the async response
});

// Arriving via a link with a line anchor (the panel navigates here when the tab wasn't on Files).
const hash = window.location.hash.slice(1);
if (LINE_ANCHOR.test(hash)) void scrollToAnchor(hash);

startOpenButton();
