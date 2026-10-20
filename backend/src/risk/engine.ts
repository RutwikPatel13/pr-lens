import type { FileRisk, LineRange, PrFile, RiskCategory, RiskFlag, RiskReport, Severity } from '@pr-lens/shared';
import { parsePatch, type DiffLine } from './patch';
import { skipReason } from './paths';
import { addedTestDeclarations, LINE_RULES, PATH_RULES, type LineRule } from './rules';

// Per rule, per file. Past this the flags stop adding information.
const MAX_FLAGS_PER_RULE_PER_FILE = 3;

const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

function rangeOf(lines: DiffLine[]): LineRange | null {
  const first = lines[0];
  const last = lines[lines.length - 1];
  if (first === undefined || last === undefined) return null;
  if (first.kind === 'del') {
    return { side: 'LEFT', start: first.oldLine ?? 0, end: last.oldLine ?? 0 };
  }
  return { side: 'RIGHT', start: first.newLine ?? 0, end: last.newLine ?? 0 };
}

// Where a file-level flag should point: the first added line, else the first removed one.
function firstChange(lines: DiffLine[]): LineRange | null {
  const line = lines.find((l) => l.kind === 'add') ?? lines.find((l) => l.kind === 'del');
  return line === undefined ? null : rangeOf([line]);
}

// Groups consecutive matching lines into runs, so a 10-line key block is one flag.
function matchingRuns(lines: DiffLine[], rule: LineRule): DiffLine[][] {
  const runs: DiffLine[][] = [];
  let current: DiffLine[] = [];
  for (const line of lines) {
    if (line.kind === rule.kind && rule.matches(line)) {
      current.push(line);
    } else if (line.kind === rule.kind || line.kind === 'context') {
      if (current.length > 0) runs.push(current);
      current = [];
    }
    // Lines of the other kind (e.g. removed lines inside an added run) don't break a run.
  }
  if (current.length > 0) runs.push(current);
  return runs;
}

function flagId(ruleId: string, path: string, lines: LineRange | null): string {
  return `${ruleId}:${path}:${lines === null ? 'file' : `${lines.side}${lines.start}`}`;
}

function analyzeFile(file: PrFile): RiskFlag[] {
  const lines = file.patch === null ? [] : parsePatch(file.patch);
  const flags: RiskFlag[] = [];

  for (const rule of PATH_RULES) {
    if (!rule.matches(file)) continue;
    const range = firstChange(lines);
    flags.push({
      id: flagId(rule.id, file.path, range),
      ruleId: rule.id,
      category: rule.category,
      severity: rule.severity,
      filePath: file.path,
      lines: range,
      explanation: rule.explanation,
    });
  }

  for (const rule of LINE_RULES) {
    if (!rule.appliesTo(file)) continue;
    let runs = matchingRuns(lines, rule);
    if (rule.id === 'test-removed' && runs.flat().length <= addedTestDeclarations(lines)) continue;

    const extra = runs.length - MAX_FLAGS_PER_RULE_PER_FILE;
    runs = runs.slice(0, MAX_FLAGS_PER_RULE_PER_FILE);
    runs.forEach((run, i) => {
      const range = rangeOf(run);
      const isLast = i === runs.length - 1;
      flags.push({
        id: flagId(rule.id, file.path, range),
        ruleId: rule.id,
        category: rule.category,
        severity: rule.severity,
        filePath: file.path,
        lines: range,
        explanation: isLast && extra > 0 ? `${rule.explanation} (${extra} more in this file.)` : rule.explanation,
      });
    });
  }

  return flags;
}

export function analyzeRisk(files: PrFile[]): RiskReport {
  const flags: RiskFlag[] = [];
  const fileRisks: FileRisk[] = [];

  files.forEach((file) => {
    const reason = skipReason(file.path);
    const fileFlags = reason === null ? analyzeFile(file) : [];
    flags.push(...fileFlags);
    const categories = [...new Set<RiskCategory>(fileFlags.map((f) => f.category))];
    fileRisks.push({ path: file.path, categories, skipReason: reason });
  });

  const fileOrder = new Map(files.map((f, i) => [f.path, i]));
  flags.sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      (fileOrder.get(a.filePath) ?? 0) - (fileOrder.get(b.filePath) ?? 0) ||
      (a.lines?.start ?? 0) - (b.lines?.start ?? 0),
  );

  return { flags, files: fileRisks };
}
