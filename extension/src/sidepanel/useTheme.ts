import { useEffect, useState } from 'react';
import { applyTheme, getThemePreference, onThemePreferenceChanged, type ThemePreference } from '../lib/theme';

// Keeps <html data-theme> in step with the saved preference and, for "system", the OS setting.
// Used by every extension page (side panel, options page).
export function useTheme(): ThemePreference {
  const [preference, setPreference] = useState<ThemePreference>('system');

  useEffect(() => {
    const load = () => void getThemePreference().then(setPreference);
    load();
    return onThemePreferenceChanged(load);
  }, []);

  useEffect(() => {
    applyTheme(preference);
    if (preference !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [preference]);

  return preference;
}
