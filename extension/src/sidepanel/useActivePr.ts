import { useEffect, useState } from 'react';
import { parsePrUrl, type PrRef } from '../lib/pr-url';

// The PR open in this window's active tab, kept current as the reviewer navigates.
export function useActivePr(): PrRef | null {
  const [pr, setPr] = useState<PrRef | null>(null);

  useEffect(() => {
    let activeTabId: number | undefined;

    async function refresh(): Promise<void> {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      activeTabId = tab?.id;
      setPr(parsePrUrl(tab?.url));
    }

    const onUpdated = (tabId: number, changeInfo: chrome.tabs.OnUpdatedInfo) => {
      if (tabId === activeTabId && changeInfo.url !== undefined) void refresh();
    };
    const onActivated = () => void refresh();

    void refresh();
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onActivated.addListener(onActivated);
    return () => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onActivated.removeListener(onActivated);
    };
  }, []);

  return pr;
}
