import { parsePrUrl } from '../lib/pr-url';

const PANEL_PATH = 'src/sidepanel/index.html';

// Chrome only opens the side panel from a user gesture, so the toolbar icon opens it.
void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Off by default; turned on per tab below. Tabs without a PR URL keep the default.
void chrome.sidePanel.setOptions({ enabled: false });

async function syncPanel(tabId: number, url: string | undefined): Promise<void> {
  // tab.url is only visible for github.com (our host permission), so other sites come through as undefined.
  const isPr = parsePrUrl(url) !== null;
  await chrome.sidePanel.setOptions({ tabId, path: PANEL_PATH, enabled: isPr });
}

// Fires on every navigation, including GitHub's client-side (history API) ones.
chrome.tabs.onUpdated.addListener((tabId, _changeInfo, tab) => {
  void syncPanel(tabId, tab.url);
});

// Tabs opened before the extension was installed or the browser restarted.
async function syncAllTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({ url: 'https://github.com/*' });
  await Promise.all(
    tabs.flatMap((tab) => (tab.id === undefined ? [] : [syncPanel(tab.id, tab.url)])),
  );
}

chrome.runtime.onInstalled.addListener(() => void syncAllTabs());
chrome.runtime.onStartup.addListener(() => void syncAllTabs());
