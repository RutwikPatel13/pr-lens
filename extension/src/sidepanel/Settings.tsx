import type { HealthResponse } from '@pr-lens/shared';
import { useEffect, useState } from 'react';
import { ApiError, fetchHealth } from '../lib/api';
import { DEFAULT_BACKEND_URL, getBackendUrl, setBackendUrl } from '../lib/settings';
import { TokenForm } from './TokenForm';
import { useGitHubToken } from './useGitHubToken';

type Check = { status: 'idle' | 'checking' } | { status: 'ok'; health: HealthResponse } | { status: 'error'; message: string };

const sectionTitle = 'mb-1 text-xs font-semibold uppercase text-gray-500';
const button = 'rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50';

export function Settings() {
  const { token, save, clear } = useGitHubToken();
  const [replacing, setReplacing] = useState(false);
  const [url, setUrl] = useState('');
  const [check, setCheck] = useState<Check>({ status: 'idle' });

  useEffect(() => {
    void getBackendUrl().then(setUrl);
  }, []);

  async function saveAndCheck() {
    await setBackendUrl(url);
    setUrl(await getBackendUrl());
    setCheck({ status: 'checking' });
    try {
      setCheck({ status: 'ok', health: await fetchHealth(AbortSignal.timeout(10_000)) });
    } catch (err) {
      setCheck({ status: 'error', message: err instanceof ApiError ? err.message : String(err) });
    }
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className={sectionTitle}>GitHub token</h2>
        {token === undefined ? null : token === null || replacing ? (
          <TokenForm
            onSave={async (value) => {
              await save(value);
              setReplacing(false);
            }}
          />
        ) : (
          <div className="space-y-2">
            <p>
              Saved token ending in <span className="font-mono">…{token.slice(-4)}</span>. Stored only in this browser.
            </p>
            <div className="flex gap-2">
              <button className={button} onClick={() => setReplacing(true)}>
                Replace
              </button>
              <button className={button} onClick={() => void clear()}>
                Remove
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className={sectionTitle}>Backend</h2>
        <p className="text-xs text-gray-600">
          Where PR Lens sends requests. Leave empty for the default ({DEFAULT_BACKEND_URL}).
        </p>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={DEFAULT_BACKEND_URL}
          className="w-full rounded border border-gray-300 px-2 py-1.5 font-mono text-xs"
        />
        <button className={button} onClick={() => void saveAndCheck()} disabled={check.status === 'checking'}>
          {check.status === 'checking' ? 'Checking…' : 'Save and check connection'}
        </button>
        {check.status === 'ok' && (
          <div className="text-xs text-green-800">
            <p>Connected.</p>
            <p>
              AI providers:{' '}
              {check.health.llmProviders.length > 0 ? check.health.llmProviders.join(', ') : 'none configured (AI summary off)'}
            </p>
            <p>Cache: {check.health.cache ? 'on' : 'off'}</p>
          </div>
        )}
        {check.status === 'error' && <p className="text-xs text-red-700">{check.message}</p>}
      </section>
    </div>
  );
}
