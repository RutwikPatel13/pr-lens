import type { FileStatus, PrData, PrResponse, SkipReason } from '@pr-lens/shared';
import { jumpToLine } from '../lib/jump-to-line';
import { RiskFlags } from './RiskFlags';

const STATUS_LABEL: Record<FileStatus, string> = {
  added: 'A',
  removed: 'D',
  modified: 'M',
  renamed: 'R',
  copied: 'C',
  changed: 'M',
  unchanged: '-',
};

const STATE_STYLE: Record<PrData['state'], string> = {
  open: 'bg-green-100 text-green-800',
  merged: 'bg-purple-100 text-purple-800',
  closed: 'bg-red-100 text-red-800',
};

const SKIP_LABEL: Record<SkipReason, string> = {
  lockfile: 'lockfile',
  generated: 'generated',
  vendored: 'vendored',
  snapshot: 'snapshot',
};

export function PrDetails({ response }: { response: PrResponse }) {
  const { pr: data, risk } = response;
  const missingPatches = data.files.filter((f) => f.patch === null).length;
  const skipReasons = new Map(risk.files.map((f) => [f.path, f.skipReason]));

  return (
    <div className="space-y-4">
      <section className="space-y-1">
        <a href={data.url} target="_blank" rel="noreferrer" className="font-semibold hover:underline">
          {data.title}
        </a>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600">
          <span className={`rounded px-1.5 py-0.5 font-medium ${STATE_STYLE[data.state]}`}>{data.state}</span>
          <span>#{data.number}</span>
          {data.author !== null && <span>by {data.author}</span>}
          <span className="font-mono">
            {data.baseRef} ← {data.headRef}
          </span>
        </div>
        <div className="text-xs">
          <span className="text-green-700">+{data.additions}</span>{' '}
          <span className="text-red-700">−{data.deletions}</span>
          <span className="text-gray-500">
            {' '}
            · {data.files.length} files · {data.commits.length} commits
          </span>
        </div>
      </section>

      {data.linkedIssues.length > 0 && (
        <section>
          <h2 className="mb-1 text-xs font-semibold uppercase text-gray-500">Linked issues</h2>
          <ul className="space-y-1">
            {data.linkedIssues.map((issue) => (
              <li key={issue.number}>
                <a href={issue.url} target="_blank" rel="noreferrer" className="hover:underline">
                  #{issue.number} {issue.title}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <RiskFlags pr={data} flags={risk.flags} />

      <section>
        <h2 className="mb-1 text-xs font-semibold uppercase text-gray-500">Files</h2>
        {data.truncated.files && (
          <p className="mb-1 text-xs text-amber-700">GitHub only returns the first 3000 files of a PR.</p>
        )}
        {missingPatches > 0 && (
          <p className="mb-1 text-xs text-amber-700">
            GitHub didn't send a diff for {missingPatches} file{missingPatches === 1 ? '' : 's'} (binary or too large).
          </p>
        )}
        <ul className="space-y-0.5 font-mono text-xs">
          {data.files.map((file) => {
            const skipReason = skipReasons.get(file.path) ?? null;
            return (
              <li key={file.path} className={`flex gap-2 ${skipReason !== null ? 'text-gray-400' : ''}`}>
                <span className="w-3 shrink-0 text-gray-400">{STATUS_LABEL[file.status]}</span>
                <button
                  onClick={() => void jumpToLine(data, file.path, null)}
                  className="min-w-0 flex-1 text-left break-all hover:underline"
                >
                  {file.path}
                  {skipReason !== null && <span className="ml-1 font-sans">({SKIP_LABEL[skipReason]})</span>}
                </button>
                <span className="shrink-0 text-gray-500">
                  +{file.additions} −{file.deletions}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <details>
        <summary className="cursor-pointer text-xs font-semibold uppercase text-gray-500">
          Commits ({data.commits.length}
          {data.truncated.commits ? ', first 250 shown' : ''})
        </summary>
        <ul className="mt-1 space-y-1 text-xs">
          {data.commits.map((commit) => (
            <li key={commit.sha}>
              <span className="font-mono text-gray-400">{commit.sha.slice(0, 7)}</span> {commit.message.split('\n')[0]}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
