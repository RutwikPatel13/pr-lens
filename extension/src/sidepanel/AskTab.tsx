import type { AskResponse, AskSource, PrRef } from '@pr-lens/shared';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError, askPr } from '../lib/api';
import { jumpToLine } from '../lib/jump-to-line';
import { Markdown } from '../lib/markdown';
import { shortName, splitPath } from '../lib/paths';
import { buttonClass } from './ui';

type Turn =
  | { question: string; status: 'loading' }
  | { question: string; status: 'answered'; response: AskResponse }
  | { question: string; status: 'failed'; error: ApiError };

const STARTERS = ['What else calls the changed code?', 'What could this break?', 'Is this change covered by tests?'];

function SourceChip({ pr, source }: { pr: PrRef; source: AskSource }) {
  const label = `${shortName(splitPath(source.path).name, 28)}${source.line === null ? '' : ` · Ln ${source.line}`}`;
  const className =
    'inline-flex cursor-pointer items-center rounded-full border border-line bg-canvas px-2 py-0.5 font-mono text-[11px] text-accent hover:bg-subtle';
  // PR files open on the Files tab; anything else is a link to GitHub.
  if (source.url === null) {
    return (
      <button
        title={source.path}
        className={className}
        onClick={() =>
          void jumpToLine(pr, source.path, source.line === null ? null : { side: 'RIGHT', start: source.line, end: source.line })
        }
      >
        {label}
      </button>
    );
  }
  return (
    <a href={source.url} target="_blank" rel="noreferrer" title={source.path} className={className}>
      {label}
    </a>
  );
}

function Elapsed() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  return <>{seconds}s</>;
}

export function AskTab({ pr, token }: { pr: PrRef; token: string }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const busy = turns.some((t) => t.status === 'loading');
  const endRef = useRef<HTMLDivElement>(null);
  // Abort an in-flight question if the panel moves to another PR (this component unmounts).
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [turns]);

  async function ask(question: string) {
    const trimmed = question.trim();
    if (trimmed === '' || busy) return;
    const history = turns.flatMap((t) => (t.status === 'answered' ? [{ question: t.question, answer: t.response.answer }] : []));
    const index = turns.length;
    setTurns((all) => [...all, { question: trimmed, status: 'loading' }]);
    setDraft('');
    controller.current = new AbortController();
    try {
      const response = await askPr(pr, token, { question: trimmed, history }, controller.current.signal);
      setTurns((all) => all.map((t, i) => (i === index ? { question: trimmed, status: 'answered', response } : t)));
    } catch (err) {
      if (controller.current.signal.aborted) return;
      const error = err instanceof ApiError ? err : new ApiError('internal', String(err));
      setTurns((all) => all.map((t, i) => (i === index ? { question: trimmed, status: 'failed', error } : t)));
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void ask(draft);
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-4 p-4">
        {turns.length === 0 && (
          <div className="flex flex-col gap-2">
            <p className="m-0 text-muted">Ask anything about this PR. Answers look at the diff, files at this commit, and code search.</p>
            <div className="flex flex-wrap gap-1.5">
              {STARTERS.map((q) => (
                <button key={q} onClick={() => void ask(q)} className={`${buttonClass} rounded-full`}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((turn, i) => (
          <div key={i} className="flex flex-col gap-2">
            <p className="m-0 max-w-[85%] self-end rounded-xl rounded-br-sm bg-ask px-3 py-2">{turn.question}</p>
            {turn.status === 'loading' && (
              <p className="m-0 animate-pulse text-xs text-muted">
                Reading the code… <Elapsed />
              </p>
            )}
            {turn.status === 'failed' && (
              <div className="flex flex-col gap-1 text-xs">
                <p className="m-0 text-high-fg">
                  {turn.error.message}
                  {turn.error.resetAt !== null && ` Try again after ${turn.error.resetAt.toLocaleTimeString()}.`}
                </p>
                <button
                  className={`${buttonClass} self-start`}
                  onClick={() => {
                    setTurns((all) => all.filter((_, j) => j !== i));
                    void ask(turn.question);
                  }}
                >
                  Retry
                </button>
              </div>
            )}
            {turn.status === 'answered' && (
              <div className="flex flex-col gap-2">
                <Markdown text={turn.response.answer} />
                {turn.response.sources.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {turn.response.sources.map((source) => (
                      <SourceChip key={`${source.path}:${source.line}`} pr={pr} source={source} />
                    ))}
                  </div>
                )}
                <p className="m-0 text-[11px] text-muted">Looked at: {turn.response.searched.join('; ')}.</p>
              </div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form onSubmit={submit} className="sticky bottom-0 flex flex-col gap-1.5 border-t border-line bg-subtle px-3 py-2.5">
        <label className="flex items-center gap-2 rounded-lg border border-line bg-canvas py-1.5 pr-1.5 pl-3">
          <span className="sr-only">Ask about this PR</span>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={turns.length === 0 ? 'Ask about this PR…' : 'Ask a follow-up…'}
            maxLength={500}
            className="min-w-0 flex-1 border-0 bg-transparent text-fg outline-none"
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={busy || draft.trim() === ''}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md bg-open text-white disabled:cursor-default disabled:opacity-50"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </label>
        <span className="text-[11px] text-muted">Code search covers the default branch; the PR's own changes come from the diff.</span>
      </form>
    </div>
  );
}
