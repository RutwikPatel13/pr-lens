import type { PrData, RiskReport } from '@pr-lens/shared';
import type { CodeSearchHit } from '../github/repo';
import { numberPatch } from '../llm/chunking';

// One piece of gathered context. Lines are labelled like the diff (R<n> = line n of the file
// at the PR's head commit, L<n> = line n of the old version), so the model can cite them and
// we can check that every citation points at something it was actually shown.
export type ContextBlock = {
  kind: 'diff' | 'file' | 'search';
  path: string;
  heading: string;
  text: string;
  lineRefs: Set<string>;
  // Where a citation of this block links to, for files outside the PR's changes.
  url: string | null;
};

export const BUDGET = {
  // Total characters of context sent with a question (~4-5k tokens).
  total: 16_000,
  diffPerFile: 4_000,
  filePerFile: 4_000,
  searchPerTerm: 1_500,
};

const WINDOW = 12;
const WHOLE_FILE_MAX_LINES = 120;

export function diffBlock(path: string, patch: string): ContextBlock {
  const { text, lineRefs, truncated } = numberPatch(patch, BUDGET.diffPerFile);
  return {
    kind: 'diff',
    path,
    heading: `Diff of ${path} in this PR${truncated ? ' (cut short)' : ''}`,
    text,
    lineRefs,
    url: null,
  };
}

// The parts of a file worth showing: the whole thing if it's short, otherwise windows around
// lines that mention a search term or that the PR changed.
export function fileBlock(path: string, content: string, focusTerms: string[], changedLines: number[], url: string | null): ContextBlock {
  const lines = content.split('\n');
  const wanted = new Set<number>();
  if (lines.length <= WHOLE_FILE_MAX_LINES) {
    lines.forEach((_, i) => wanted.add(i));
  } else {
    const terms = focusTerms.map((t) => t.toLowerCase());
    const centers = [
      ...changedLines.map((n) => n - 1),
      ...lines.flatMap((line, i) => (terms.some((t) => line.toLowerCase().includes(t)) ? [i] : [])),
    ];
    // Nothing to center on: the top of the file usually says what it is.
    if (centers.length === 0) centers.push(0);
    for (const c of centers) {
      for (let i = Math.max(0, c - WINDOW); i <= Math.min(lines.length - 1, c + WINDOW); i++) wanted.add(i);
    }
  }

  const out: string[] = [];
  const lineRefs = new Set<string>();
  let length = 0;
  let previous = -2;
  let truncated = false;
  for (const i of [...wanted].sort((a, b) => a - b)) {
    const text = `${i !== previous + 1 && out.length > 0 ? '...\n' : ''}${`R${i + 1}`.padEnd(7)}${lines[i]}`;
    if (length + text.length > BUDGET.filePerFile) {
      truncated = true;
      break;
    }
    out.push(text);
    lineRefs.add(`R${i + 1}`);
    length += text.length + 1;
    previous = i;
  }
  return {
    kind: 'file',
    path,
    heading: `${path} at the PR's head commit${lines.length > WHOLE_FILE_MAX_LINES ? ' (excerpts)' : ''}${truncated ? ' (cut short)' : ''}`,
    text: out.join('\n'),
    lineRefs,
    url,
  };
}

export function searchBlocks(term: string, hits: CodeSearchHit[]): ContextBlock[] {
  let budget = BUDGET.searchPerTerm;
  return hits.flatMap((hit) => {
    if (budget <= 0) return [];
    const text = hit.fragments.join('\n...\n').slice(0, budget);
    budget -= text.length;
    return [
      {
        kind: 'search' as const,
        path: hit.path,
        heading: `Code search for "${term}" on the default branch: ${hit.path}`,
        text,
        lineRefs: new Set<string>(),
        url: hit.url,
      },
    ];
  });
}

// New-side line numbers the PR touched in a file, for centering file excerpts.
export function changedLines(patch: string | null): number[] {
  if (patch === null) return [];
  return [...numberPatch(patch, Number.MAX_SAFE_INTEGER).lineRefs]
    .filter((ref) => ref.startsWith('R'))
    .map((ref) => Number(ref.slice(1)));
}

// Keeps blocks in order until the total budget is spent.
export function withinBudget(blocks: ContextBlock[]): ContextBlock[] {
  let used = 0;
  return blocks.filter((block) => {
    const size = block.heading.length + block.text.length;
    if (used + size > BUDGET.total) return false;
    used += size;
    return true;
  });
}

export function prFileList(pr: PrData, risk: RiskReport): string {
  return pr.files
    .map((f) => {
      const flags = risk.flags.filter((flag) => flag.filePath === f.path).map((flag) => flag.ruleId);
      return `- ${f.path} (${f.status}, +${f.additions} -${f.deletions})${flags.length > 0 ? ` flags: ${[...new Set(flags)].join(', ')}` : ''}`;
    })
    .join('\n');
}
