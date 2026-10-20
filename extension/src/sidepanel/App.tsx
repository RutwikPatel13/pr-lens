import type { ApiErrorCode, PrAnalysis, PrRef } from '@pr-lens/shared';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, fetchAnalysis, fetchPr } from '../lib/api';
import { PrDetails } from './PrDetails';
import { Settings } from './Settings';
import { TokenForm } from './TokenForm';
import { useActivePr } from './useActivePr';
import { useGitHubToken } from './useGitHubToken';
import { usePrFetch } from './usePrData';

export function App() {
  const pr = useActivePr();
  const { token, save, clear } = useGitHubToken();
  const [showSettings, setShowSettings] = useState(false);

  return (
    <main className="space-y-4 p-4 font-sans text-sm text-gray-900">
      <header className="flex items-baseline justify-between">
        <h1 className="text-base font-semibold">PR Lens</h1>
        {token !== undefined && (
          <button onClick={() => setShowSettings((s) => !s)} className="text-xs text-gray-500 hover:underline">
            {showSettings ? 'Back' : 'Settings'}
          </button>
        )}
      </header>
      {token === undefined ? null : showSettings ? (
        <Settings />
      ) : token === null ? (
        <TokenForm onSave={save} />
      ) : pr === null ? (
        <p className="text-gray-500">Open a GitHub pull request to see its analysis.</p>
      ) : (
        // Keyed by PR so per-PR state (like Re-run) resets when the reviewer moves to another PR.
        <PrPanel key={`${pr.owner}/${pr.repo}#${pr.number}`} pr={pr} token={token} onBadToken={clear} />
      )}
    </main>
  );
}

type ErrorCode = ApiErrorCode | 'network';
const TOKEN_ERRORS: ReadonlySet<ErrorCode> = new Set(['bad_token', 'missing_token', 'forbidden']);
const RETRYABLE_ERRORS: ReadonlySet<ErrorCode> = new Set(['network', 'rate_limited', 'github_error', 'internal']);

function PrPanel({ pr, token, onBadToken }: { pr: PrRef; token: string; onBadToken: () => Promise<void> }) {
  // Retry and Re-run work the same way: bumping a count gives the fetcher a new identity,
  // which makes usePrFetch fetch again.
  const [retries, setRetries] = useState(0);
  const prFetcher = useCallback((ref: PrRef, t: string, signal: AbortSignal) => fetchPr(ref, t, signal), [retries]);
  const state = usePrFetch(prFetcher, pr, token);

  // Re-runs skip the cache; the first load (count 0) uses it.
  const [reruns, setReruns] = useState(0);
  const analysisFetcher = useCallback(
    (ref: PrRef, t: string, signal: AbortSignal) => fetchAnalysis(ref, t, signal, reruns > 0),
    [reruns],
  );
  // Starts in parallel with the PR fetch; the slow LLM part fills in when ready.
  const analysis = usePrFetch(analysisFetcher, pr, token);
  // The last analysis that loaded, kept on screen if a Re-run fails (free tiers often refuse
  // a second run within the same minute).
  const [lastAnalysis, setLastAnalysis] = useState<PrAnalysis | null>(null);
  useEffect(() => {
    if (analysis.status === 'loaded') setLastAnalysis(analysis.data);
  }, [analysis]);

  if (state.status === 'loading') return <LoadingSkeleton />;
  if (state.status === 'loaded') {
    return (
      <PrDetails
        response={state.data}
        analysis={analysis}
        previousAnalysis={lastAnalysis}
        onRerun={() => setReruns((n) => n + 1)}
      />
    );
  }

  return (
    <ErrorBox
      error={state.error}
      onRetry={RETRYABLE_ERRORS.has(state.error.code) ? () => setRetries((n) => n + 1) : null}
      onChangeToken={TOKEN_ERRORS.has(state.error.code) ? () => void onBadToken() : null}
    />
  );
}

type ErrorBoxProps = {
  error: ApiError;
  onRetry: (() => void) | null;
  onChangeToken: (() => void) | null;
};

function ErrorBox({ error, onRetry, onChangeToken }: ErrorBoxProps) {
  return (
    <div className="space-y-2 rounded border border-red-200 bg-red-50 p-3 text-red-900">
      <p>{error.message}</p>
      {error.code === 'network' && (
        <p className="text-xs">
          If you run the backend locally, start it with <code className="font-mono">npm run dev -w backend</code>. To use a
          different backend, change it in Settings.
        </p>
      )}
      {error.resetAt !== null && (
        <p className="text-xs">GitHub allows more requests after {error.resetAt.toLocaleTimeString()}.</p>
      )}
      <div className="flex gap-3 text-xs">
        {onRetry !== null && (
          <button onClick={onRetry} className="underline">
            Retry
          </button>
        )}
        {onChangeToken !== null && (
          <button onClick={onChangeToken} className="underline">
            Enter a different token
          </button>
        )}
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  const bar = 'h-3 rounded bg-gray-200';
  return (
    <div className="animate-pulse space-y-3" aria-label="Loading pull request">
      <div className={`${bar} h-4 w-3/4`} />
      <div className={`${bar} w-1/2`} />
      <div className={`${bar} w-1/3`} />
      <div className="space-y-2 pt-4">
        <div className={`${bar} w-full`} />
        <div className={`${bar} w-5/6`} />
        <div className={`${bar} w-2/3`} />
      </div>
    </div>
  );
}
