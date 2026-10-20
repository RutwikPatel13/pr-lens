import { useCallback, useEffect, useState } from 'react';
import { clearGitHubToken, getGitHubToken, onSettingsChanged, setGitHubToken } from '../lib/settings';

// undefined while the stored token is still loading, null when there isn't one.
export function useGitHubToken() {
  const [token, setToken] = useState<string | null | undefined>(undefined);

  // Re-reads on change so the side panel and the options page stay in sync.
  useEffect(() => {
    const load = () => void getGitHubToken().then(setToken);
    load();
    return onSettingsChanged(load);
  }, []);

  const save = useCallback(async (value: string) => {
    await setGitHubToken(value);
    setToken(value);
  }, []);

  const clear = useCallback(async () => {
    await clearGitHubToken();
    setToken(null);
  }, []);

  return { token, save, clear };
}
