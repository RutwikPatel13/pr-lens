import type { PrResponse, RiskFlag } from '@pr-lens/shared';
import { evaluateCustomRules } from '@pr-lens/shared/custom-rules';
import type { RuleSettings } from './rules-storage';

// Built-in flags minus switched-off categories, plus the reviewer's own rules. Used by the panel
// and by the service worker for the in-page button's count, so both always agree.
export function flagsWithRules(response: PrResponse, settings: RuleSettings): RiskFlag[] {
  const disabled = new Set(settings.disabledCategories);
  const skip = new Map(response.risk.files.map((f) => [f.path, f.skipReason]));
  return [
    ...response.risk.flags.filter((f) => !disabled.has(f.category)),
    ...evaluateCustomRules(response.pr.files, settings.rules, skip),
  ];
}
