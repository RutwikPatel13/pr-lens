import type { PrRef, RiskCategory, RiskFlag, Severity } from '@pr-lens/shared';
import { jumpToLine } from '../lib/jump-to-line';

const CATEGORY_LABEL: Record<RiskCategory, string> = {
  schema: 'Schema',
  auth: 'Auth',
  payments: 'Payments',
  config: 'Config',
  dependencies: 'Dependencies',
  tests: 'Tests',
  secrets: 'Secrets',
  logic: 'Logic',
};

const SEVERITY_STYLE: Record<Severity, string> = {
  high: 'bg-red-100 text-red-800',
  medium: 'bg-amber-100 text-amber-800',
  low: 'bg-gray-100 text-gray-700',
};

function lineLabel(flag: RiskFlag): string {
  if (flag.lines === null) return '';
  const { start, end } = flag.lines;
  return start === end ? `:${start}` : `:${start}-${end}`;
}

const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

const location = (flag: RiskFlag) =>
  `${flag.filePath}:${flag.lines === null ? 'file' : `${flag.lines.side}${flag.lines.start}`}`;

// Rule flags arrive first; LLM flags join once the analysis finishes. An LLM flag on the same
// line as a rule flag becomes a note under it (the model is usually adding context), so the
// list doesn't show the same line twice.
export function RiskFlags({ pr, ruleFlags, llmFlags }: { pr: PrRef; ruleFlags: RiskFlag[]; llmFlags: RiskFlag[] }) {
  const ruleLocations = new Set(ruleFlags.map(location));
  const notes = new Map<string, string[]>();
  const separate: RiskFlag[] = [];
  for (const flag of llmFlags) {
    const key = location(flag);
    if (ruleLocations.has(key)) notes.set(key, [...(notes.get(key) ?? []), flag.explanation]);
    else separate.push(flag);
  }
  const flags = [...ruleFlags, ...separate].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  // Several rule flags can share a line; the notes go under the first one shown.
  const noteOwner = new Map<string, string>();
  for (const flag of flags) if (flag.source === 'rule' && !noteOwner.has(location(flag))) noteOwner.set(location(flag), flag.id);
  return (
    <section>
      <h2 className="mb-1 text-xs font-semibold uppercase text-gray-500">Risk flags ({flags.length})</h2>
      {flags.length === 0 ? (
        <p className="text-xs text-gray-500">No rule-based flags. That doesn't mean it's safe, just that nothing obvious matched.</p>
      ) : (
        <ul className="space-y-2">
          {flags.map((flag) => (
            <li key={flag.id} className="space-y-0.5">
              <div className="flex items-center gap-1.5 text-xs">
                <span className={`rounded px-1.5 py-0.5 font-medium ${SEVERITY_STYLE[flag.severity]}`}>{flag.severity}</span>
                <span className="text-gray-600">{CATEGORY_LABEL[flag.category]}</span>
                {flag.source === 'llm' && <span className="rounded bg-violet-100 px-1.5 py-0.5 text-violet-800">AI</span>}
              </div>
              <button
                onClick={() => void jumpToLine(pr, flag.filePath, flag.lines)}
                className="text-left font-mono text-xs break-all text-blue-700 hover:underline"
              >
                {flag.filePath}
                {lineLabel(flag)}
              </button>
              <p className="text-xs text-gray-700">{flag.explanation}</p>
              {noteOwner.get(location(flag)) === flag.id &&
                notes.get(location(flag))?.map((note) => (
                  <p key={note} className="border-l-2 border-violet-300 pl-2 text-xs text-violet-900">
                    <span className="font-medium">AI: </span>
                    {note}
                  </p>
                ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
