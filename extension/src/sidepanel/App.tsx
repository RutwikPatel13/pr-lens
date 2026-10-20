import type { PrAnalysis, PrRef } from '@pr-lens/shared';
import { useCallback, useEffect, useState } from 'react';
import { fetchAnalysis, fetchPr } from '../lib/api';
import { PrDetails } from './PrDetails';
import { TokenForm } from './TokenForm';
import { useActivePr } from './useActivePr';
import { useGitHubToken } from './useGitHubToken';
import { usePrFetch } from './usePrData';

export function App() {
  const pr = useActivePr();
  const { token, save, clear } = useGitHubToken();

  return (
    <main className="space-y-4 p-4 font-sans text-sm text-gray-900">
      <header className="flex items-baseline justify-between">
        <h1 className="text-base font-semibold">PR Lens</h1>
        {typeof token === 'string' && (
          <button onClick={() => void clear()} className="text-xs text-gray-500 hover:underline">
            Change token
          </button>
        )}
      </header>
      {token === undefined ? null : token === null ? (
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

function PrPanel({ pr, token, onBadToken }: { pr: PrRef; token: string; onBadToken: () => Promise<void> }) {
  const state = usePrFetch(fetchPr, pr, token);
  // Each Re-run click bumps the count; the new fetcher identity makes usePrFetch fetch again,
  // skipping the cache. The first load (count 0) uses the cache.
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

  if (state.status === 'loading') {
    return <p className="text-gray-500">Loading #{pr.number}…</p>;
  }
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

  const { code, message, resetAt } = state.error;
  return (
    <div className="space-y-2 rounded border border-red-200 bg-red-50 p-3 text-red-900">
      <p>{message}</p>
      {resetAt !== null && <p className="text-xs">Try again after {resetAt.toLocaleTimeString()}.</p>}
      {(code === 'bad_token' || code === 'missing_token' || code === 'forbidden') && (
        <button onClick={() => void onBadToken()} className="text-xs underline">
          Enter a different token
        </button>
      )}
    </div>
  );
}
