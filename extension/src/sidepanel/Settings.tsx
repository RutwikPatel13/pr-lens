import type { HealthResponse } from '@pr-lens/shared';
import { useEffect, useState } from 'react';
import { ApiError, fetchHealth } from '../lib/api';
import { DEFAULT_BACKEND_URL, getBackendUrl, setBackendUrl } from '../lib/settings';
import { setThemePreference, type ThemePreference } from '../lib/theme';
import { TokenForm } from './TokenForm';
import { buttonClass, Section } from './ui';
import { useGitHubToken } from './useGitHubToken';
import { useTheme } from './useTheme';

type Check = { status: 'idle' | 'checking' } | { status: 'ok'; health: HealthResponse } | { status: 'error'; message: string };

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export function Settings() {
  const { token, save, clear } = useGitHubToken();
  const theme = useTheme();
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
    <div className="flex flex-col">
      <Section title="GitHub token">
        {token === undefined ? null : token === null || replacing ? (
          <TokenForm
            onSave={async (value) => {
              await save(value);
              setReplacing(false);
            }}
          />
        ) : (
          <>
            <p className="m-0">
              Saved token ending in <span className="font-mono">…{token.slice(-4)}</span>. Stored only in this browser.
            </p>
            <div className="flex gap-2">
              <button className={buttonClass} onClick={() => setReplacing(true)}>
                Replace
              </button>
              <button className={buttonClass} onClick={() => void clear()}>
                Remove
              </button>
            </div>
          </>
        )}
      </Section>

      <Section title="Theme">
        <div className="flex gap-1 self-start rounded-md border border-line bg-subtle p-0.5" role="group" aria-label="Theme">
          {THEMES.map((option) => (
            <button
              key={option.value}
              aria-pressed={theme === option.value}
              onClick={() => void setThemePreference(option.value)}
              className={`cursor-pointer rounded px-3 py-1 text-xs ${
                theme === option.value ? 'bg-control font-semibold text-fg shadow-sm' : 'text-muted hover:text-fg'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Backend">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Where PR Lens sends requests. Leave empty for the default.
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={DEFAULT_BACKEND_URL}
            className="rounded-md border border-line bg-canvas px-2 py-1.5 font-mono text-xs text-fg"
          />
        </label>
        <button className={`${buttonClass} self-start`} onClick={() => void saveAndCheck()} disabled={check.status === 'checking'}>
          {check.status === 'checking' ? 'Checking…' : 'Save and check connection'}
        </button>
        {check.status === 'ok' && (
          <div className="text-xs text-success">
            <p className="m-0 font-semibold">Connected.</p>
            <p className="m-0 text-muted">
              AI providers:{' '}
              {check.health.llmProviders.length > 0 ? check.health.llmProviders.join(', ') : 'none configured (AI summary off)'}
            </p>
            <p className="m-0 text-muted">Cache: {check.health.cache ? 'on' : 'off'}</p>
          </div>
        )}
        {check.status === 'error' && <p className="m-0 text-xs text-danger">{check.message}</p>}
      </Section>
    </div>
  );
}
