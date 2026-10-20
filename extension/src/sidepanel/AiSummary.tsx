import type { FileRole, NotReadReason, PrAnalysis, PrRef } from '@pr-lens/shared';
import { useEffect, useState } from 'react';
import { jumpToLine } from '../lib/jump-to-line';
import { shortName, splitPath } from '../lib/paths';
import { Section, buttonClass } from './ui';
import type { FetchState } from './usePrFetch';

const ROLE_LABEL: Record<FileRole, string> = {
  schema: 'schema',
  config: 'config',
  core: 'core',
  api: 'api',
  ui: 'ui',
  test: 'test',
  docs: 'docs',
  other: 'other',
};

const NOT_READ_LABEL: Record<NotReadReason, string> = {
  lockfile: 'lockfile',
  generated: 'generated',
  vendored: 'vendored',
  snapshot: 'snapshot',
  no_patch: 'no diff from GitHub',
  over_budget: 'over the size budget',
};

function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
}

type Props = {
  pr: PrRef;
  state: FetchState<PrAnalysis>;
  // The last analysis that loaded for this PR, shown while a Re-run is loading or after it fails.
  previous: PrAnalysis | null;
  onRerun: () => void;
};

// Summary and review order. The model/cache/Re-run line is AnalysisFooter, at the bottom of the panel.
export function AiSummary({ pr, state, previous, onRerun }: Props) {
  if (state.status !== 'loaded' && previous !== null) {
    const note =
      state.status === 'loading'
        ? 'Re-running…'
        : `Re-run failed: ${state.error.message}${state.error.resetAt !== null ? ` Next provider frees up at ${state.error.resetAt.toLocaleTimeString()}.` : ''} Showing the earlier analysis.`;
    return (
      <>
        <p className="m-0 border-b border-line bg-medium-bg px-4 py-2 text-xs text-medium-fg">{note}</p>
        <AnalysisSections pr={pr} analysis={previous} />
      </>
    );
  }
  if (state.status === 'loading') return <AnalysisLoading />;
  if (state.status === 'error') {
    const { code, message, resetAt } = state.error;
    const text =
      code === 'llm_not_configured' ? 'AI summary is off: the backend has no LLM keys configured.' : message;
    return (
      <Section title="Summary">
        <p className="m-0 text-xs text-muted">
          {text}
          {resetAt !== null && ` Next provider frees up at ${resetAt.toLocaleTimeString()}.`}
        </p>
        {code !== 'llm_not_configured' && (
          <button onClick={onRerun} className={`${buttonClass} self-start`}>
            Try again
          </button>
        )}
      </Section>
    );
  }
  return <AnalysisSections pr={pr} analysis={state.data} />;
}

// No progress events from the backend yet, so the honest signal is elapsed time.
function AnalysisLoading() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <Section title="Summary">
      <div className="flex animate-pulse flex-col gap-2" aria-hidden="true">
        <div className="h-3 w-full rounded bg-inset" />
        <div className="h-3 w-5/6 rounded bg-inset" />
        <div className="h-3 w-2/3 rounded bg-inset" />
      </div>
      <p className="m-0 text-xs text-muted">
        Reading the diff with an LLM… {seconds}s
        {seconds >= 15 && '. Free tiers are slow on large PRs; this can take a minute or two. The risks below are already complete.'}
      </p>
    </Section>
  );
}

function AnalysisSections({ pr, analysis }: { pr: PrRef; analysis: PrAnalysis }) {
  const { summary, reviewOrder, notRead, truncated } = analysis;
  const overBudget = notRead.filter((f) => f.reason === 'over_budget').length;
  const unread = notRead.length + truncated.length;

  return (
    <>
      <Section title="Summary" aside={<span className="text-[11px] text-muted">AI-written · check it</span>}>
        {overBudget > 0 && (
          <p className="m-0 rounded-md border border-medium-line bg-medium-bg p-2 text-xs text-medium-fg">
            Large PR: the AI read {reviewOrder.length} of {reviewOrder.length + notRead.length} changed files, starting with the
            flagged ones. Risks cover every file.
          </p>
        )}
        <p className="m-0">{summary.what}</p>
        <p className="m-0 text-muted">
          <span className="font-semibold text-fg">Why: </span>
          {summary.why}
        </p>
        {summary.areas.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {summary.areas.map((area) => (
              <span key={area} className="rounded-full bg-inset px-2 py-0.5 text-xs text-muted">
                {area}
              </span>
            ))}
          </div>
        )}
      </Section>

      <Section title="Review order">
        <ol className="m-0 flex list-none flex-col gap-3 p-0">
          {reviewOrder.map((step, i) => {
            const { dir, name } = splitPath(step.path);
            return (
              <li key={step.path}>
                <button
                  onClick={() => void jumpToLine(pr, step.path, null)}
                  title={step.path}
                  className="flex w-full cursor-pointer gap-2.5 text-left text-fg"
                >
                  <span
                    className={`flex h-5 w-5 flex-none items-center justify-center rounded-full text-[11px] font-semibold ${
                      i === 0 ? 'bg-strong text-on-strong' : 'border border-line bg-inset text-fg'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-mono text-xs font-semibold text-accent hover:underline">{shortName(name)}</span>
                    <span className="text-xs text-muted">
                      {dir !== '' ? `${dir} · ` : ''}
                      {ROLE_LABEL[step.role]}
                    </span>
                    <span className="text-xs">{step.reason}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        {unread > 0 && (
          <details className="text-xs text-muted">
            <summary className="cursor-pointer">
              Not fully read: {unread} file{unread === 1 ? '' : 's'}
            </summary>
            <ul className="m-0 mt-1 flex list-none flex-col gap-0.5 p-0 font-mono">
              {notRead.map((f) => (
                <li key={f.path} className="break-all">
                  {f.path} <span className="font-sans">({NOT_READ_LABEL[f.reason]})</span>
                </li>
              ))}
              {truncated.map((path) => (
                <li key={path} className="break-all">
                  {path} <span className="font-sans">(diff cut short)</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </Section>
    </>
  );
}

// Pinned to the bottom of the panel: which model wrote the analysis, whether it's cached, Re-run.
export function AnalysisFooter({ analysis, busy, onRerun }: { analysis: PrAnalysis | null; busy: boolean; onRerun: () => void }) {
  if (analysis === null) return null;
  const model = analysis.models.map((m) => m.split('/').slice(1).join('/')).join(', ');
  return (
    <footer className="sticky bottom-0 mt-auto flex items-center justify-between gap-3 border-t border-line bg-subtle px-4 py-2.5 text-xs text-muted">
      <span title={`Generated by ${analysis.models.join(', ')}. Check before relying on it.`}>
        {model} · {timeAgo(analysis.generatedAt)}
        {analysis.cached ? ' · cached for this commit' : ''}
      </span>
      <button onClick={onRerun} disabled={busy} className={buttonClass}>
        {busy ? 'Running…' : 'Re-run'}
      </button>
    </footer>
  );
}
