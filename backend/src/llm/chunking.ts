import type { NotReadFile, PrData, RiskFlag, RiskReport } from '@pr-lens/shared';
import { parsePatch } from '../risk/patch';
import { isTestPath } from '../risk/paths';

export type ChunkLimits = {
  // One file's numbered diff is cut here. ~3k tokens at ~4 chars per token.
  maxFileChars: number;
  // Diff text per map call. Kept small for free-tier tokens-per-minute limits: Groq's free tier
  // counts prompt + max output against 8k tokens/minute, and rejects a single larger request.
  maxChunkChars: number;
  // Map calls per PR. Bounds latency, free-tier usage and Workers' subrequest limit.
  maxChunks: number;
};

export const DEFAULT_LIMITS: ChunkLimits = { maxFileChars: 10_000, maxChunkChars: 12_000, maxChunks: 8 };

export type PromptFile = {
  path: string;
  header: string;
  // Diff lines prefixed with their reference: "R12 + added", "L7 - removed", "R13   context".
  numberedDiff: string;
  // Line references that exist in numberedDiff. Model-cited lines are checked against this.
  lineRefs: Set<string>;
  truncated: boolean;
  ruleFlags: RiskFlag[];
};

export type ChunkPlan = {
  chunks: PromptFile[][];
  notRead: NotReadFile[];
  truncated: string[];
};

export function numberPatch(patch: string, maxChars: number): { text: string; lineRefs: Set<string>; truncated: boolean } {
  const out: string[] = [];
  const lineRefs = new Set<string>();
  let length = 0;
  // Last line number seen on each side, to spot the jump between hunks.
  let lastOld: number | null = null;
  let lastNew: number | null = null;

  for (const line of parsePatch(patch)) {
    const ref = line.kind === 'del' ? `L${line.oldLine}` : `R${line.newLine}`;
    const marker = line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : ' ';
    // A jump in line numbers means a new hunk; mark the gap so the model doesn't read it as adjacent.
    const gap =
      (line.newLine !== null && lastNew !== null && line.newLine > lastNew + 1) ||
      (line.oldLine !== null && lastOld !== null && line.oldLine > lastOld + 1);
    const text = `${gap ? '...\n' : ''}${ref.padEnd(6)}${marker} ${line.text}`;

    if (length + text.length + 1 > maxChars) return { text: out.join('\n'), lineRefs, truncated: true };
    out.push(text);
    lineRefs.add(ref);
    length += text.length + 1;
    lastOld = line.oldLine ?? lastOld;
    lastNew = line.newLine ?? lastNew;
  }
  return { text: out.join('\n'), lineRefs, truncated: false };
}

// Lower reads first when the budget runs out: flagged files, then source, then tests, then docs.
function priority(path: string, flagged: boolean): number {
  if (flagged) return 0;
  if (/\.(md|mdx|txt|rst)$/i.test(path)) return 3;
  if (isTestPath(path)) return 2;
  return 1;
}

export function planChunks(pr: PrData, risk: RiskReport, limits: ChunkLimits = DEFAULT_LIMITS): ChunkPlan {
  const notRead: NotReadFile[] = [];
  const skip = new Map(risk.files.map((f) => [f.path, f.skipReason]));
  const candidates: { file: PromptFile; size: number; priority: number; order: number }[] = [];

  pr.files.forEach((file, order) => {
    const reason = skip.get(file.path) ?? null;
    if (reason !== null) return notRead.push({ path: file.path, reason });
    if (file.patch === null) return notRead.push({ path: file.path, reason: 'no_patch' });

    const ruleFlags = risk.flags.filter((f) => f.filePath === file.path);
    const { text, lineRefs, truncated } = numberPatch(file.patch, limits.maxFileChars);
    const header = `### ${file.path} (${file.status}, +${file.additions} -${file.deletions})`;
    const promptFile: PromptFile = { path: file.path, header, numberedDiff: text, lineRefs, truncated, ruleFlags };
    candidates.push({ file: promptFile, size: header.length + text.length, priority: priority(file.path, ruleFlags.length > 0), order });
  });

  // First-fit in priority order, so the important files are the ones that make it in.
  candidates.sort((a, b) => a.priority - b.priority || a.order - b.order);
  const chunks: { files: PromptFile[]; size: number }[] = [];
  for (const candidate of candidates) {
    const chunk = chunks.find((c) => c.size + candidate.size <= limits.maxChunkChars);
    if (chunk !== undefined) {
      chunk.files.push(candidate.file);
      chunk.size += candidate.size;
    } else if (chunks.length < limits.maxChunks) {
      chunks.push({ files: [candidate.file], size: candidate.size });
    } else {
      notRead.push({ path: candidate.file.path, reason: 'over_budget' });
    }
  }

  return {
    // Within a chunk, sort by path so files from the same folder sit together.
    chunks: chunks.map((c) => c.files.sort((a, b) => a.path.localeCompare(b.path))),
    notRead,
    truncated: candidates.filter((c) => c.file.truncated && !notRead.some((n) => n.path === c.file.path)).map((c) => c.file.path),
  };
}
