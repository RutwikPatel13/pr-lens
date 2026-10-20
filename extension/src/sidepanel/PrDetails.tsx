import type { FileStatus, PrAnalysis, PrData, PrResponse, SkipReason } from '@pr-lens/shared';
import { jumpToLine } from '../lib/jump-to-line';
import { shortPath } from '../lib/paths';
import { AiSummary, AnalysisFooter } from './AiSummary';
import { mergeFlags } from './flags';
import { RiskFlags } from './RiskFlags';
import { Section, SeverityCount } from './ui';
import type { FetchState } from './usePrFetch';

const STATUS: Record<FileStatus, { letter: string; className: string }> = {
  added: { letter: 'A', className: 'text-success' },
  removed: { letter: 'D', className: 'text-danger' },
  modified: { letter: 'M', className: 'text-attention' },
  renamed: { letter: 'R', className: 'text-accent' },
  copied: { letter: 'C', className: 'text-accent' },
  changed: { letter: 'M', className: 'text-attention' },
  unchanged: { letter: '-', className: 'text-muted' },
};

const STATE: Record<PrData['state'], { label: string; className: string }> = {
  open: { label: 'Open', className: 'bg-open' },
  merged: { label: 'Merged', className: 'bg-merged' },
  closed: { label: 'Closed', className: 'bg-closed' },
};

const SKIP_LABEL: Record<SkipReason, string> = {
  lockfile: 'lockfile',
  generated: 'generated',
  vendored: 'vendored',
  snapshot: 'snapshot',
};

type Props = {
  response: PrResponse;
  analysis: FetchState<PrAnalysis>;
  previousAnalysis: PrAnalysis | null;
  onRerun: () => void;
};

export function PrDetails({ response, analysis, previousAnalysis, onRerun }: Props) {
  const { pr: data, risk } = response;
  const shownAnalysis = analysis.status === 'loaded' ? analysis.data : previousAnalysis;
  const merged = mergeFlags(risk.flags, shownAnalysis?.flags ?? []);
  const missingPatches = data.files.filter((f) => f.patch === null).length;
  const skipReasons = new Map(risk.files.map((f) => [f.path, f.skipReason]));
  const state = STATE[data.state];

  return (
    <div className="flex min-h-full flex-col">
      <section className="flex flex-col gap-2 border-b border-line p-4">
        <a href={data.url} target="_blank" rel="noreferrer" className="text-base leading-snug font-semibold text-fg hover:underline">
          {data.title} <span className="font-normal text-muted">#{data.number}</span>
        </a>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <span className={`rounded-full px-2 py-0.5 font-medium text-white ${state.className}`}>{state.label}</span>
          {data.author !== null && <span>{data.author}</span>}
          <span aria-hidden="true">·</span>
          <span>
            <span className="font-semibold text-success">+{data.additions}</span>{' '}
            <span className="font-semibold text-danger">−{data.deletions}</span>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {data.files.length} file{data.files.length === 1 ? '' : 's'}
          </span>
        </div>
        {(merged.counts.high > 0 || merged.counts.medium > 0) && (
          <div className="mt-1 flex gap-1.5">
            {merged.counts.high > 0 && <SeverityCount severity="high" count={merged.counts.high} />}
            {merged.counts.medium > 0 && <SeverityCount severity="medium" count={merged.counts.medium} />}
          </div>
        )}
      </section>

      {data.linkedIssues.length > 0 && (
        <Section title="Linked issues">
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {data.linkedIssues.map((issue) => (
              <li key={issue.number}>
                <a href={issue.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                  #{issue.number} {issue.title}
                </a>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <AiSummary pr={data} state={analysis} previous={previousAnalysis} onRerun={onRerun} />

      <RiskFlags pr={data} merged={merged} />

      <Section title="Files">
        {data.truncated.files && <p className="m-0 text-xs text-medium-fg">GitHub only returns the first 3000 files of a PR.</p>}
        {missingPatches > 0 && (
          <p className="m-0 text-xs text-muted">
            GitHub didn't send a diff for {missingPatches} file{missingPatches === 1 ? '' : 's'} (binary or too large).
          </p>
        )}
        <ul className="m-0 flex list-none flex-col gap-1 p-0 font-mono text-xs">
          {data.files.map((file) => {
            const skipReason = skipReasons.get(file.path) ?? null;
            const status = STATUS[file.status];
            return (
              <li key={file.path} className={`flex gap-2 ${skipReason !== null ? 'opacity-60' : ''}`}>
                <span className={`w-3 flex-none ${status.className}`}>{status.letter}</span>
                <button
                  onClick={() => void jumpToLine(data, file.path, null)}
                  title={file.path}
                  className="min-w-0 flex-1 cursor-pointer truncate text-left text-fg hover:underline"
                >
                  {shortPath(file.path)}
                  {skipReason !== null && <span className="ml-1 font-sans text-muted">({SKIP_LABEL[skipReason]})</span>}
                </button>
                <span className="flex-none text-muted">
                  +{file.additions} −{file.deletions}
                </span>
              </li>
            );
          })}
        </ul>
      </Section>

      <details className="border-b border-line px-4 py-3">
        <summary className="cursor-pointer text-xs font-semibold text-muted">
          Commits ({data.commits.length}
          {data.truncated.commits ? ', first 250 shown' : ''})
        </summary>
        <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0 text-xs">
          {data.commits.map((commit) => (
            <li key={commit.sha}>
              <span className="font-mono text-muted">{commit.sha.slice(0, 7)}</span> {commit.message.split('\n')[0]}
            </li>
          ))}
        </ul>
      </details>

      <AnalysisFooter analysis={shownAnalysis} busy={analysis.status === 'loading'} onRerun={onRerun} />
    </div>
  );
}
