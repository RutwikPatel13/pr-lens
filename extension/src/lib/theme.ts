export type ThemePreference = 'system' | 'light' | 'dark';

const THEME_KEY = 'theme';

export async function getThemePreference(): Promise<ThemePreference> {
  const stored = (await chrome.storage.local.get(THEME_KEY))[THEME_KEY];
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

export async function setThemePreference(theme: ThemePreference): Promise<void> {
  if (theme === 'system') await chrome.storage.local.remove(THEME_KEY);
  else await chrome.storage.local.set({ [THEME_KEY]: theme });
}

export function onThemePreferenceChanged(listener: () => void): () => void {
  const handler = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && THEME_KEY in changes) listener();
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}

const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

export function applyTheme(theme: ThemePreference): void {
  const resolved = theme === 'system' ? (systemDark() ? 'dark' : 'light') : theme;
  document.documentElement.dataset.theme = resolved;
}
