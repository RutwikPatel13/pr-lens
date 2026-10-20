import type { PrRef, ReviewThread, SuggestedReply } from '@pr-lens/shared';
import { useEffect, useRef, useState } from 'react';
import { ApiError, suggestReply } from '../lib/api';
import { jumpToLine } from '../lib/jump-to-line';
import { Markdown } from '../lib/markdown';
import { shortName, splitPath } from '../lib/paths';
import { AiTag, buttonClass } from './ui';
import type { FetchState } from './usePrFetch';

function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 60) return `${Math.max(minutes, 1)} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days < 60 ? `${days} days ago` : new Date(iso).toLocaleDateString();
}

type Props = { pr: PrRef; token: string; threads: FetchState<ReviewThread[]> };

export function DiscussionTab({ pr, token, threads }: Props) {
  if (threads.status === 'loading') return <p className="m-0 p-4 text-muted">Loading review threads…</p>;
  if (threads.status === 'error') return <p className="m-0 p-4 text-high-fg">{threads.error.message}</p>;
  if (threads.data.length === 0) {
    return <p className="m-0 p-4 text-muted">No review comments on this PR yet.</p>;
  }
  // Unresolved first: those are the ones that might need a reply.
  const sorted = [...threads.data].sort((a, b) => Number(a.resolved) - Number(b.resolved));
  return (
    <div className="flex flex-col gap-3 p-4">
      {sorted.map((thread) => (
        <ThreadCard key={thread.id} pr={pr} token={token} thread={thread} />
      ))}
    </div>
  );
}

// Bot reviews can run to pages; show the start and let the reader expand.
const COLLAPSE_AT = 360;

function CommentBody({ body }: { body: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = body.length > COLLAPSE_AT;
  const shown = expanded || !long ? body : `${body.slice(0, body.lastIndexOf(' ', COLLAPSE_AT))}…`;
  return (
    <div className="flex flex-col gap-1 text-[13px]">
      <Markdown text={shown} />
      {long && (
        <button onClick={() => setExpanded((e) => !e)} className="cursor-pointer self-start text-xs text-accent hover:underline">
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}

type ReplyState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; reply: SuggestedReply; text: string; copied: boolean }
  | { status: 'failed'; message: string };

function ThreadCard({ pr, token, thread }: { pr: PrRef; token: string; thread: ReviewThread }) {
  const [reply, setReply] = useState<ReplyState>({ status: 'idle' });
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const last = thread.comments[thread.comments.length - 1];

  async function suggest() {
    setReply({ status: 'loading' });
    controller.current = new AbortController();
    try {
      const result = await suggestReply(pr, token, thread.id, controller.current.signal);
      setReply({ status: 'done', reply: result, text: result.reply, copied: false });
    } catch (err) {
      if (controller.current.signal.aborted) return;
      setReply({ status: 'failed', message: err instanceof ApiError ? err.message : String(err) });
    }
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setReply((r) => (r.status === 'done' ? { ...r, copied: true } : r));
  }

  return (
    <article className="overflow-hidden rounded-md border border-line">
      <header className="flex items-center justify-between gap-2 border-b border-line bg-subtle px-3 py-2">
        <button
          onClick={() =>
            void jumpToLine(pr, thread.path, thread.line === null ? null : { side: 'RIGHT', start: thread.line, end: thread.line })
          }
          title={thread.path}
          className="min-w-0 cursor-pointer truncate text-left font-mono text-xs font-semibold text-fg hover:underline"
        >
          {shortName(splitPath(thread.path).name, 30)}
          {thread.line !== null && <span className="ml-1.5 font-normal text-accent">Ln {thread.line}</span>}
        </button>
        <span className="flex-none text-[11px] text-muted">
          {[thread.resolved && 'Resolved', thread.outdated && 'Outdated'].filter(Boolean).join(' · ')}
        </span>
      </header>

      <div className="flex flex-col gap-2.5 p-3">
        {thread.comments.map((comment, i) => (
          <div key={comment.url} className={`flex flex-col gap-0.5 ${i > 0 ? 'border-l-2 border-line pl-3' : ''}`}>
            <span className="text-xs text-muted">
              <span className="font-semibold text-fg">@{comment.author ?? 'ghost'}</span> · {timeAgo(comment.createdAt)}
            </span>
            <CommentBody body={comment.body} />
          </div>
        ))}

        {reply.status === 'idle' && (
          <button onClick={() => void suggest()} className={`${buttonClass} self-start`}>
            Suggest reply
          </button>
        )}
        {reply.status === 'loading' && <p className="m-0 animate-pulse text-xs text-muted">Drafting a reply…</p>}
        {reply.status === 'failed' && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-high-fg">{reply.message}</span>
            <button onClick={() => void suggest()} className={buttonClass}>
              Retry
            </button>
          </div>
        )}
        {reply.status === 'done' && (
          <div className="flex flex-col gap-2 rounded-md border border-line bg-subtle p-2.5">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-muted">
              <AiTag /> Suggested reply
            </span>
            <label className="sr-only" htmlFor={`reply-${thread.id}`}>
              Suggested reply
            </label>
            <textarea
              id={`reply-${thread.id}`}
              rows={4}
              value={reply.text}
              onChange={(e) => setReply({ ...reply, text: e.target.value, copied: false })}
              className="w-full resize-y rounded-md border border-line bg-canvas p-2 text-[13px] text-fg"
            />
            <span className="text-xs text-muted">Why: {reply.reply.reason}</span>
            <div className="flex gap-2">
              <button
                onClick={() => void copy(reply.text)}
                className="cursor-pointer rounded-md bg-open px-3 py-1 text-xs font-semibold text-white"
              >
                {reply.copied ? 'Copied' : 'Copy'}
              </button>
              {last !== undefined && (
                <a href={last.url} target="_blank" rel="noreferrer" className={buttonClass}>
                  Open thread on GitHub
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
