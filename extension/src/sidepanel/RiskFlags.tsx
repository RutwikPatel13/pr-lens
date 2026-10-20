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

export function RiskFlags({ pr, flags }: { pr: PrRef; flags: RiskFlag[] }) {
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
              </div>
              <button
                onClick={() => void jumpToLine(pr, flag.filePath, flag.lines)}
                className="text-left font-mono text-xs break-all text-blue-700 hover:underline"
              >
                {flag.filePath}
                {lineLabel(flag)}
              </button>
              <p className="text-xs text-gray-700">{flag.explanation}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
