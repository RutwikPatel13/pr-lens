const TOKEN_KEY = 'githubToken';

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
