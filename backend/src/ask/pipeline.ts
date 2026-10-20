import type { AskRequest, AskResponse, AskSource, PrData, ReviewThread, RiskReport, SuggestedReply } from '@pr-lens/shared';
import type { CodeSearchHit } from '../github/repo';
import type { FallbackLlm } from '../llm/fallback';
import { changedLines, diffBlock, fileBlock, prFileList, searchBlocks, withinBudget, type ContextBlock } from './context';
import { answerRequest, planRequest, replyRequest } from './prompts';
import { parseAnswer, parsePlan, parseReply, type RawAnswer } from './schemas';

export type AskDeps = {
  fileAtCommit: (path: string) => Promise<string | null>;
  searchCode: (term: string) => Promise<CodeSearchHit[]>;
};

const MAX_SOURCES = 6;

const blobUrl = (pr: PrData, path: string, line: number | null) =>
  `https://github.com/${pr.owner}/${pr.repo}/blob/${pr.headSha}/${path}${line === null ? '' : `#L${line}`}`;

async function gather(pr: PrData, risk: RiskReport, deps: AskDeps, plan: { search: string[]; files: string[] }) {
  const searched: string[] = [];
  const prFiles = new Map(pr.files.map((f) => [f.path, f]));

  // The diff of the files the plan named, then the flagged ones, then the rest.
  const flagged = new Set(risk.flags.map((f) => f.filePath));
  const diffOrder = [...pr.files].sort(
    (a, b) => Number(!plan.files.includes(a.path)) - Number(!plan.files.includes(b.path)) || Number(!flagged.has(a.path)) - Number(!flagged.has(b.path)),
  );
  const diffs = diffOrder.flatMap((f) => (f.patch === null ? [] : [diffBlock(f.path, f.patch)]));

  const files: ContextBlock[] = [];
  for (const path of plan.files) {
    const content = await deps.fileAtCommit(path);
    if (content === null) {
      searched.push(`${path} (not found at this commit)`);
      continue;
    }
    const inPr = prFiles.get(path);
    files.push(fileBlock(path, content, plan.search, changedLines(inPr?.patch ?? null), inPr === undefined ? blobUrl(pr, path, null) : null));
  }

  const searches: ContextBlock[] = [];
  for (const term of plan.search) {
    try {
      const hits = await deps.searchCode(term);
      searches.push(...searchBlocks(term, hits));
      searched.push(`code search for "${term}" on the default branch (${hits.length} file${hits.length === 1 ? '' : 's'})`);
    } catch (err) {
      // Search is a bonus (it's rate-limited to ~10 a minute): answer from the rest.
      console.warn('code search failed', err);
      searched.push(`code search for "${term}" (unavailable right now)`);
    }
  }

  // Files the plan asked for first, then search hits, then diffs to fill the remaining budget.
  const blocks = withinBudget([...files, ...searches, ...diffs]);
  const diffCount = blocks.filter((b) => b.kind === 'diff').length;
  if (diffCount > 0) searched.unshift(`the diff of ${diffCount} changed file${diffCount === 1 ? '' : 's'}`);
  for (const b of blocks.filter((block) => block.kind === 'file')) searched.push(`${b.path} at this commit`);
  return { blocks, searched };
}

// A cited source must be something the model was shown: unknown paths are dropped, and a
// line that wasn't in the shown text becomes a file-level source rather than a wrong link.
function toSources(raw: RawAnswer['sources'], blocks: ContextBlock[], pr: PrData): AskSource[] {
  const prFiles = new Set(pr.files.map((f) => f.path));
  const seen = new Set<string>();
  const sources: AskSource[] = [];
  for (const source of raw) {
    const forPath = blocks.filter((b) => b.path === source.path);
    if (forPath.length === 0) continue;
    const ref = source.line?.trim().toUpperCase() ?? null;
    const valid = ref !== null && /^R\d+$/.test(ref) && forPath.some((b) => b.lineRefs.has(ref));
    const line = valid && ref !== null ? Number(ref.slice(1)) : null;
    const key = `${source.path}:${line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const searchUrl = forPath.find((b) => b.kind === 'search')?.url ?? null;
    const url = prFiles.has(source.path) ? null : line === null && searchUrl !== null ? searchUrl : blobUrl(pr, source.path, line);
    sources.push({ path: source.path, line, url });
    if (sources.length === MAX_SOURCES) break;
  }
  return sources;
}

export async function askPr(
  llm: FallbackLlm,
  deps: AskDeps,
  pr: PrData,
  risk: RiskReport,
  request: AskRequest,
): Promise<Omit<AskResponse, 'cached'>> {
  const models: string[] = [];
  const fileList = prFileList(pr, risk);

  const plan = await llm.completeJson(planRequest(pr, fileList, request.history, request.question), parsePlan);
  models.push(plan.model);

  const { blocks, searched } = await gather(pr, risk, deps, plan.value);

  const answer = await llm.completeJson(answerRequest(pr, blocks, request.history, request.question), parseAnswer);
  models.push(answer.model);

  return {
    answer: answer.value.answer,
    sources: toSources(answer.value.sources, blocks, pr),
    searched,
    models: [...new Set(models)],
  };
}

export async function suggestReply(
  llm: FallbackLlm,
  deps: AskDeps,
  pr: PrData,
  thread: ReviewThread,
  // The GitHub login the reply is written as.
  viewer: string,
): Promise<Omit<SuggestedReply, 'cached'>> {
  const blocks: ContextBlock[] = [];
  const prFile = pr.files.find((f) => f.path === thread.path);
  const content = await deps.fileAtCommit(thread.path);
  if (content !== null) {
    blocks.push(fileBlock(thread.path, content, [], thread.line === null ? changedLines(prFile?.patch ?? null) : [thread.line], null));
  } else if (prFile?.patch != null) {
    blocks.push(diffBlock(thread.path, prFile.patch));
  }
  const { value, model } = await llm.completeJson(replyRequest(pr, thread, blocks, viewer), parseReply);
  return { reply: value.reply, reason: value.reason, models: [model] };
}
