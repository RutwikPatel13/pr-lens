import type { PrRef, RiskCategory, RiskFlag } from '@pr-lens/shared';
import { jumpToLine } from '../lib/jump-to-line';
import { shortName, splitPath } from '../lib/paths';
import { groupByFile, type MergedFlags } from './flags';
import { AiTag, FileIcon, Section, SeverityBadge } from './ui';

const CATEGORY_LABEL: Record<RiskCategory, string> = {
  schema: 'Schema',
  auth: 'Auth',
  payments: 'Payments',
  config: 'Config',
  dependencies: 'Dependencies',
  tests: 'Tests',
  secrets: 'Secrets',
  logic: 'Logic',
  custom: 'Custom',
};

function lineLabel(flag: RiskFlag): string {
  if (flag.lines === null) return 'File';
  const { start, end, side } = flag.lines;
  const range = start === end ? `${start}` : `${start}–${end}`;
  // LEFT lines exist only in the old version of the file (removed code).
  return side === 'LEFT' ? `Old ${range}` : `Ln ${range}`;
}

export function RiskFlags({ pr, merged }: { pr: PrRef; merged: MergedFlags }) {
  const groups = groupByFile(merged.flags);

  return (
    <Section title="Risks">
      {groups.length === 0 ? (
        <p className="m-0 text-xs text-muted">No rule-based flags. That doesn't mean it's safe, just that nothing obvious matched.</p>
      ) : (
        groups.map((group) => {
          const { name } = splitPath(group.path);
          return (
            <div key={group.path} className="overflow-hidden rounded-md border border-line">
              <button
                onClick={() => void jumpToLine(pr, group.path, null)}
                title={group.path}
                className="flex w-full cursor-pointer items-center gap-1.5 border-b border-line bg-subtle px-3 py-2 text-left text-muted hover:text-fg"
              >
                <FileIcon />
                <span className="min-w-0 truncate font-mono text-xs font-semibold text-fg">{shortName(name)}</span>
              </button>
              {group.flags.map((flag, i) => (
                <FlagRow
                  key={flag.id}
                  pr={pr}
                  flag={flag}
                  notes={merged.notes.get(flag.id) ?? []}
                  last={i === group.flags.length - 1}
                />
              ))}
            </div>
          );
        })
      )}
    </Section>
  );
}

function FlagRow({ pr, flag, notes, last }: { pr: PrRef; flag: RiskFlag; notes: string[]; last: boolean }) {
  return (
    <button
      onClick={() => void jumpToLine(pr, flag.filePath, flag.lines)}
      className={`flex w-full cursor-pointer gap-2.5 bg-canvas px-3 py-2.5 text-left text-fg hover:bg-subtle ${last ? '' : 'border-b border-line'}`}
    >
      <span className="w-11 flex-none font-mono text-xs text-accent">{lineLabel(flag)}</span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex items-center gap-1.5">
          <SeverityBadge severity={flag.severity} />
          <span className="text-xs text-muted">{flag.label ?? CATEGORY_LABEL[flag.category]}</span>
          {flag.source === 'llm' && <AiTag />}
          {flag.source === 'custom' && (
            <span className="h-4 rounded border border-accent px-1 text-[10px] leading-4 font-semibold text-accent">Your rule</span>
          )}
        </span>
        <span>{flag.explanation}</span>
        {notes.map((note) => (
          <span key={note} className="flex gap-1.5 text-xs text-muted">
            <AiTag />
            {note}
          </span>
        ))}
      </span>
    </button>
  );
}
