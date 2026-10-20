import type { CustomRule, RiskCategory } from '@pr-lens/shared';

// The reviewer's rules and switched-off built-in categories. chrome.storage.sync, so they follow
// the reviewer to their other Chrome profiles' devices; nothing here is secret (the token is local-only).
const RULES_KEY = 'customRules';
const DISABLED_KEY = 'disabledCategories';

export type RuleSettings = {
  rules: CustomRule[];
  disabledCategories: RiskCategory[];
};

export async function getRuleSettings(): Promise<RuleSettings> {
  const stored = await chrome.storage.sync.get([RULES_KEY, DISABLED_KEY]);
  const rules = stored[RULES_KEY];
  const disabled = stored[DISABLED_KEY];
  return {
    rules: Array.isArray(rules) ? (rules as CustomRule[]) : [],
    disabledCategories: Array.isArray(disabled) ? (disabled as RiskCategory[]) : [],
  };
}

export async function setCustomRules(rules: CustomRule[]): Promise<void> {
  await chrome.storage.sync.set({ [RULES_KEY]: rules });
}

export async function setDisabledCategories(categories: RiskCategory[]): Promise<void> {
  await chrome.storage.sync.set({ [DISABLED_KEY]: categories });
}

export function onRuleSettingsChanged(listener: () => void): () => void {
  const handler = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'sync' && (RULES_KEY in changes || DISABLED_KEY in changes)) listener();
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}
