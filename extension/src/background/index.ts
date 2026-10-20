import type { PrRef } from '@pr-lens/shared';
import { fetchPr } from '../lib/api';
import { isOpenPanelMessage, isRiskCountsRequest, type RiskCountsResponse } from '../lib/messages';
import { parsePrUrl } from '../lib/pr-url';
import { getGitHubToken } from '../lib/settings';

const PANEL_PATH = 'src/sidepanel/index.html';

// Chrome only opens the side panel from a user gesture: the in-page "PR Lens" button
// (content/open-button.ts), the toolbar icon, or the _execute_action shortcut.
void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// The panel only exists on PR tabs: off by default, switched on per tab below. Leaving the
// PR pages in a tab closes it there; other tabs never show it.
void chrome.sidePanel.setOptions({ enabled: false });

async function syncPanel(tabId: number, url: string | undefined): Promise<void> {
  // tab.url is only visible for github.com (our host permission); other sites come through as undefined.
  await chrome.sidePanel.setOptions({ tabId, path: PANEL_PATH, enabled: parsePrUrl(url) !== null });
}

// Fires on every navigation, including GitHub's client-side (history API) ones.
chrome.tabs.onUpdated.addListener((tabId, _changeInfo, tab) => {
  void syncPanel(tabId, tab.url);
});

// Tabs opened before the extension was installed or the browser restarted.
async function syncAllTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({ url: 'https://github.com/*' });
  await Promise.all(tabs.flatMap((tab) => (tab.id === undefined ? [] : [syncPanel(tab.id, tab.url)])));
}

chrome.runtime.onInstalled.addListener(() => void syncAllTabs());
chrome.runtime.onStartup.addListener(() => void syncAllTabs());

async function riskCounts(pr: PrRef): Promise<RiskCountsResponse> {
  const token = await getGitHubToken();
  if (token === null) return { status: 'unavailable' };
  try {
    const { risk } = await fetchPr(pr, token, AbortSignal.timeout(15_000));
    const count = (severity: 'high' | 'medium') => risk.flags.filter((f) => f.severity === severity).length;
    return { status: 'ok', high: count('high'), medium: count('medium') };
  } catch (err) {
    // The badge is optional: the button still opens the panel, which shows the real error.
    console.warn('PR Lens: risk counts unavailable', err);
    return { status: 'unavailable' };
  }
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  if (isOpenPanelMessage(message) && tabId !== undefined) {
    // Nothing may be awaited before open(): Chrome allows it only while the click's user
    // gesture is still active. setOptions is fired, not awaited, for the same reason.
    void chrome.sidePanel.setOptions({ tabId, path: PANEL_PATH, enabled: true });
    chrome.sidePanel.open({ tabId }).then(
      () => sendResponse({ ok: true }),
      (err: unknown) => sendResponse({ ok: false, error: String(err) }),
    );
    return true;
  }
  if (isRiskCountsRequest(message)) {
    void riskCounts(message.pr).then(sendResponse);
    return true;
  }
  return undefined;
});
