import type { PrRef } from '@pr-lens/shared';
import { PrDetails } from './PrDetails';
import { TokenForm } from './TokenForm';
import { useActivePr } from './useActivePr';
import { useGitHubToken } from './useGitHubToken';
import { fetchAnalysis, fetchPr } from '../lib/api';
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
        <PrPanel pr={pr} token={token} onBadToken={clear} />
      )}
    </main>
  );
}

function PrPanel({ pr, token, onBadToken }: { pr: PrRef; token: string; onBadToken: () => Promise<void> }) {
  const state = usePrFetch(fetchPr, pr, token);
  // Starts in parallel with the PR fetch; the slow LLM part fills in when ready.
  const analysis = usePrFetch(fetchAnalysis, pr, token);

  if (state.status === 'loading') {
    return <p className="text-gray-500">Loading #{pr.number}…</p>;
  }
  if (state.status === 'loaded') {
    return <PrDetails response={state.data} analysis={analysis} />;
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
