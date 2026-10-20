import type { LineRange, PrRef } from '@pr-lens/shared';
import { diffAnchor, filesTabUrl } from './github-links';
import type { ScrollToAnchorMessage } from './messages';

// Shows a file/line on the PR's Files tab in the active tab. If that tab is already
// on the Files tab, the content script scrolls without a reload; otherwise we navigate
// there and the content script scrolls once the page loads.
export async function jumpToLine(pr: PrRef, path: string, lines: LineRange | null): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) return;

  const anchor = await diffAnchor(path, lines);
  const filesUrl = filesTabUrl(pr);

  if (tab.url?.split('#')[0] === filesUrl) {
    const message: ScrollToAnchorMessage = { type: 'pr-lens/scroll-to-anchor', anchor };
    try {
      await chrome.tabs.sendMessage(tab.id, message);
      return;
    } catch {
      // No content script in this tab yet (it was open before the extension loaded).
      // Falls through to a navigation, which loads one.
    }
  }
  await chrome.tabs.update(tab.id, { url: `${filesUrl}#${anchor}` });
}
