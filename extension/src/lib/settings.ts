const TOKEN_KEY = 'githubToken';
const BACKEND_URL_KEY = 'backendUrl';

export const DEFAULT_BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8787';

// chrome.storage.local, not sync: the token shouldn't leave this machine via the user's Google account.
export async function getGitHubToken(): Promise<string | null> {
  const stored = await chrome.storage.local.get(TOKEN_KEY);
  const token = stored[TOKEN_KEY];
  return typeof token === 'string' && token !== '' ? token : null;
}

export async function setGitHubToken(token: string): Promise<void> {
  await chrome.storage.local.set({ [TOKEN_KEY]: token });
}

export async function clearGitHubToken(): Promise<void> {
  await chrome.storage.local.remove(TOKEN_KEY);
}

export async function getBackendUrl(): Promise<string> {
  const stored = await chrome.storage.local.get(BACKEND_URL_KEY);
  const url = stored[BACKEND_URL_KEY];
  return typeof url === 'string' && url !== '' ? url : DEFAULT_BACKEND_URL;
}

// An empty value goes back to the default.
export async function setBackendUrl(url: string): Promise<void> {
  const trimmed = url.trim().replace(/\/+$/, '');
  if (trimmed === '') await chrome.storage.local.remove(BACKEND_URL_KEY);
  else await chrome.storage.local.set({ [BACKEND_URL_KEY]: trimmed });
}

// Fires when settings change in any extension page (side panel, options page).
export function onSettingsChanged(listener: () => void): () => void {
  const handler = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && (TOKEN_KEY in changes || BACKEND_URL_KEY in changes)) listener();
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}
