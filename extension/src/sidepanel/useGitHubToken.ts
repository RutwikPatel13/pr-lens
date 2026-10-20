import { useCallback, useEffect, useState } from 'react';
import { clearGitHubToken, getGitHubToken, setGitHubToken } from '../lib/settings';

// undefined while the stored token is still loading, null when there isn't one.
export function useGitHubToken() {
  const [token, setToken] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    void getGitHubToken().then(setToken);
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
