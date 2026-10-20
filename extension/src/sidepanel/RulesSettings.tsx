import type { CustomRule, CustomRuleKind, PrRef, RiskCategory, Severity } from '@pr-lens/shared';
import { evaluateCustomRules, patternError } from '@pr-lens/shared/custom-rules';
import { useState, type FormEvent } from 'react';
import { fetchPr } from '../lib/api';
import { setCustomRules, setDisabledCategories } from '../lib/rules-storage';
import { buttonClass, Section, SeverityBadge } from './ui';
import { useActivePr } from './useActivePr';
import { useGitHubToken } from './useGitHubToken';
import { usePrFetch } from './usePrFetch';
import { useRuleSettings } from './useRuleSettings';

const KIND_LABEL: Record<CustomRuleKind, string> = { path: 'File path', added: 'Added line', removed: 'Removed line' };
const KIND_SUMMARY: Record<CustomRuleKind, string> = { path: 'Path matches', added: 'Added line', removed: 'Removed line' };

// Built-in categories a reviewer can switch off ('logic' is LLM-only, 'custom' is theirs).
const BUILT_IN: { category: RiskCategory; label: string }[] = [
  { category: 'schema', label: 'Schema & migrations' },
  { category: 'auth', label: 'Auth' },
  { category: 'payments', label: 'Payments' },
  { category: 'secrets', label: 'Secrets' },
  { category: 'tests', label: 'Tests' },
  { category: 'dependencies', label: 'Dependencies' },
  { category: 'config', label: 'CI & config' },
];

const newRule = (): CustomRule => ({
  id: crypto.randomUUID(),
  name: '',
  kind: 'path',
  pattern: '',
  regex: false,
  severity: 'medium',
  explanation: '',
  enabled: true,
});

const summary = (rule: CustomRule) =>
  `${KIND_SUMMARY[rule.kind]}${rule.kind === 'path' ? '' : rule.regex ? ' matches' : ' contains'}`;

export function RulesSettings() {
  const { rules, disabledCategories } = useRuleSettings();
  const [editing, setEditing] = useState<{ rule: CustomRule; isNew: boolean } | null>(null);

  if (editing !== null) {
    return (
      <RuleEditor
        initial={editing.rule}
        isNew={editing.isNew}
        onCancel={() => setEditing(null)}
        onSave={async (rule) => {
          await setCustomRules(editing.isNew ? [...rules, rule] : rules.map((r) => (r.id === rule.id ? rule : r)));
          setEditing(null);
        }}
        onDelete={async () => {
          await setCustomRules(rules.filter((r) => r.id !== editing.rule.id));
          setEditing(null);
        }}
      />
    );
  }

  const disabled = new Set(disabledCategories);
  return (
    <>
      <Section
        title="Your rules"
        aside={
          <button onClick={() => setEditing({ rule: newRule(), isNew: true })} className="cursor-pointer rounded-md bg-open px-2.5 py-1 text-xs font-semibold text-white">
            New rule
          </button>
        }
      >
        {rules.length === 0 ? (
          <p className="m-0 text-xs text-muted">
            No rules yet. Flag what matters to you, like anything under <code className="font-mono">billing/</code> or new{' '}
            <code className="font-mono">TODO</code>s. They run on this browser only and show with a "Your rule" tag.
          </p>
        ) : (
          <ul className="m-0 list-none overflow-hidden rounded-md border border-line p-0">
            {rules.map((rule, i) => (
              <li key={rule.id} className={`flex items-start gap-2.5 px-3 py-2.5 ${i > 0 ? 'border-t border-line' : ''}`}>
                <button onClick={() => setEditing({ rule, isNew: false })} className="flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5 text-left">
                  <span className="flex items-center gap-1.5">
                    <span className={`font-semibold ${rule.enabled ? 'text-fg' : 'text-muted'}`}>{rule.name}</span>
                    <SeverityBadge severity={rule.severity} />
                  </span>
                  <span className="truncate text-xs text-muted">
                    {summary(rule)} <code className="rounded bg-inset px-1 font-mono">{rule.pattern}</code>
                    {!rule.enabled && ' · off'}
                  </span>
                </button>
                <Switch
                  on={rule.enabled}
                  label={`${rule.name} rule`}
                  onChange={(enabled) => void setCustomRules(rules.map((r) => (r.id === rule.id ? { ...r, enabled } : r)))}
                />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Built-in rules">
        <p className="m-0 text-xs text-muted">Turn off a category that's noise for you. Its flags, including the AI's, are hidden and stop counting on the PR Lens button.</p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
          {BUILT_IN.map(({ category, label }) => (
            <label key={category} className="flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                checked={!disabled.has(category)}
                onChange={(e) =>
                  void setDisabledCategories(
                    e.target.checked ? disabledCategories.filter((c) => c !== category) : [...disabledCategories, category],
                  )
                }
              />
              {label}
            </label>
          ))}
        </div>
      </Section>
    </>
  );
}

function Switch({ on, label, onChange }: { on: boolean; label: string; onChange: (on: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative mt-0.5 h-5 w-9 flex-none cursor-pointer rounded-full ${on ? 'bg-open' : 'bg-line'}`}
    >
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
    </button>
  );
}

const SEVERITIES: Severity[] = ['high', 'medium', 'low'];

type EditorProps = {
  initial: CustomRule;
  isNew: boolean;
  onSave: (rule: CustomRule) => Promise<void>;
  onCancel: () => void;
  onDelete: () => Promise<void>;
};

function RuleEditor({ initial, isNew, onSave, onCancel, onDelete }: EditorProps) {
  const [rule, setRule] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const update = (changes: Partial<CustomRule>) => setRule((r) => ({ ...r, ...changes }));
  const error = rule.name.trim() === '' ? 'Give the rule a name.' : patternError(rule);
  const pr = useActivePr();
  const { token } = useGitHubToken();

  function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (error === null) void onSave({ ...rule, name: rule.name.trim(), pattern: rule.pattern.trim() });
  }

  const label = 'flex flex-col gap-1 text-xs font-semibold text-muted';
  const input = 'rounded-md border border-line bg-canvas px-2 py-1.5 text-[13px] font-normal text-fg';
  const segment = (active: boolean) =>
    `cursor-pointer rounded px-2 py-1 text-xs ${active ? 'bg-control font-semibold text-fg shadow-sm' : 'text-muted hover:text-fg'}`;

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 p-4">
      <h2 className="m-0 text-sm font-semibold">{isNew ? 'New rule' : 'Edit rule'}</h2>

      <label className={label}>
        Name
        <input value={rule.name} onChange={(e) => update({ name: e.target.value })} placeholder="Billing code" maxLength={60} className={input} />
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-muted">Flag when</span>
        <div role="group" aria-label="Flag when" className="grid grid-cols-3 gap-0.5 rounded-md border border-line bg-subtle p-0.5">
          {(Object.keys(KIND_LABEL) as CustomRuleKind[]).map((kind) => (
            <button key={kind} type="button" aria-pressed={rule.kind === kind} onClick={() => update({ kind })} className={segment(rule.kind === kind)}>
              {KIND_LABEL[kind]}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1 text-xs text-muted">
          <span className="sr-only">Pattern</span>
          <input
            value={rule.pattern}
            onChange={(e) => update({ pattern: e.target.value })}
            placeholder={rule.kind === 'path' ? '**/billing/**' : rule.regex ? 'console\\.(log|debug)' : 'TODO'}
            className={`${input} font-mono text-xs`}
          />
          {rule.kind === 'path' ? (
            <span>
              <code className="font-mono">*</code> matches within a folder, <code className="font-mono">**</code> across folders.
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <input type="checkbox" id="rule-regex" checked={rule.regex} onChange={(e) => update({ regex: e.target.checked })} />
              <label htmlFor="rule-regex">Regular expression (otherwise: line contains this text)</label>
            </span>
          )}
        </label>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-muted">Severity</span>
        <div role="group" aria-label="Severity" className="flex gap-1.5">
          {SEVERITIES.map((severity) => (
            <button
              key={severity}
              type="button"
              aria-pressed={rule.severity === severity}
              onClick={() => update({ severity })}
              className={`cursor-pointer rounded-full border px-3 py-0.5 text-xs capitalize ${
                rule.severity === severity ? `font-semibold ${severityActive[severity]}` : 'border-line bg-control text-muted'
              }`}
            >
              {severity}
            </button>
          ))}
        </div>
      </div>

      <label className={label}>
        What the flag says
        <textarea
          rows={3}
          value={rule.explanation}
          onChange={(e) => update({ explanation: e.target.value })}
          placeholder="Billing code: check amounts, currencies and retries."
          maxLength={300}
          className={`${input} resize-y`}
        />
      </label>

      {pr !== null && typeof token === 'string' && patternError(rule) === null && <RulePreview pr={pr} token={token} rule={rule} />}

      {submitted && error !== null && <p className="m-0 text-xs text-danger">{error}</p>}
      <div className="flex items-center gap-2">
        <button type="submit" className="cursor-pointer rounded-md bg-open px-3.5 py-1.5 text-[13px] font-semibold text-white">
          Save rule
        </button>
        <button type="button" onClick={onCancel} className={buttonClass}>
          Cancel
        </button>
        {!isNew && (
          <button type="button" onClick={() => void onDelete()} className="ml-auto cursor-pointer text-xs text-danger hover:underline">
            Delete rule
          </button>
        )}
      </div>
    </form>
  );
}

const severityActive: Record<Severity, string> = {
  high: 'border-high-fg bg-high-bg text-high-fg',
  medium: 'border-medium-fg bg-medium-bg text-medium-fg',
  low: 'border-low-fg bg-low-bg text-low-fg',
};

const PREVIEW_FILES = 3;

// Runs the draft rule against the PR open in this window, so the reviewer sees what it catches.
function RulePreview({ pr, token, rule }: { pr: PrRef; token: string; rule: CustomRule }) {
  const state = usePrFetch(fetchPr, pr, token);
  if (state.status !== 'loaded') return null;
  const skip = new Map(state.data.risk.files.map((f) => [f.path, f.skipReason]));
  const matched = [...new Set(evaluateCustomRules(state.data.pr.files, [{ ...rule, enabled: true }], skip).map((f) => f.filePath))];
  return (
    <div className="overflow-hidden rounded-md border border-line">
      <div className="border-b border-line bg-subtle px-3 py-2 text-xs">
        <span className="font-semibold">Preview on #{pr.number}</span>
        <span className="text-muted">
          {' '}
          · matches {matched.length} of {state.data.pr.files.length} files
        </span>
      </div>
      {matched.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-0.5 px-3 py-2 font-mono text-xs">
          {matched.slice(0, PREVIEW_FILES).map((path) => (
            <li key={path} className="truncate" title={path}>
              {path}
            </li>
          ))}
          {matched.length > PREVIEW_FILES && <li className="font-sans text-muted">and {matched.length - PREVIEW_FILES} more</li>}
        </ul>
      )}
    </div>
  );
}
