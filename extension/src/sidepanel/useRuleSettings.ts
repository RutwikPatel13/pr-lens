import { useEffect, useState } from 'react';
import { getRuleSettings, onRuleSettingsChanged, type RuleSettings } from '../lib/rules-storage';

// Rules and switched-off categories, kept current across the side panel and the options page.
export function useRuleSettings(): RuleSettings {
  const [settings, setSettings] = useState<RuleSettings>({ rules: [], disabledCategories: [] });
  useEffect(() => {
    const load = () => void getRuleSettings().then(setSettings);
    load();
    return onRuleSettingsChanged(load);
  }, []);
  return settings;
}
