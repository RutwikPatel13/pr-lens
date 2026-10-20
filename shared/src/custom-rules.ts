import type { CustomRule, LineRange, PrFile, RiskFlag, SkipReason } from './index';
import { parsePatch, type DiffLine } from './patch';

// Runs the reviewer's own rules over a PR's files. Pure, so the side panel, the service
// worker (for the button's count) and the rule editor's preview all share it.

// Past this many runs per rule per file, more flags stop adding information (as with built-in rules).
const MAX_FLAGS_PER_RULE_PER_FILE = 3;

// Globs as people write them in .gitignore-style tools:
//   *   any characters except "/"      **   any characters, across folders
//   ?   one character except "/"       **/  zero or more folders (so "**/billing/**" matches "billing/a.ts")
// A pattern without "/" also matches against the file name alone ("*.sql" matches "db/x.sql").
export function globToRegExp(glob: string): RegExp {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') {
        out += '(?:.*/)?';
        i += 2;
      } else {
        out += '.*';
        i += 1;
      }
    } else if (c === '*') {
      out += '[^/]*';
    } else if (c === '?') {
      out += '[^/]';
    } else {
      out += (c ?? '').replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${out}$`);
}

export function pathMatches(glob: string, path: string): boolean {
  const re = globToRegExp(glob.trim().replace(/^\/+/, ''));
  if (re.test(path)) return true;
  return !glob.includes('/') && re.test(path.slice(path.lastIndexOf('/') + 1));
}

// null when the pattern is fine; otherwise a message for the rule editor.
export function patternError(rule: Pick<CustomRule, 'kind' | 'pattern' | 'regex'>): string | null {
  if (rule.pattern.trim() === '') return 'Enter a pattern.';
  if (rule.kind !== 'path' && rule.regex) {
    try {
      new RegExp(rule.pattern);
    } catch (err) {
      return `Not a valid regular expression: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  return null;
}

function lineMatcher(rule: CustomRule): (text: string) => boolean {
  if (!rule.regex) return (text) => text.includes(rule.pattern);
  const re = new RegExp(rule.pattern);
  return (text) => re.test(text);
}

function rangeOf(lines: DiffLine[]): LineRange | null {
  const first = lines[0];
  const last = lines[lines.length - 1];
  if (first === undefined || last === undefined) return null;
  return first.kind === 'del'
    ? { side: 'LEFT', start: first.oldLine ?? 0, end: last.oldLine ?? 0 }
    : { side: 'RIGHT', start: first.newLine ?? 0, end: last.newLine ?? 0 };
}

// Consecutive matching lines of the rule's kind become one run (one flag).
function matchingRuns(lines: DiffLine[], kind: 'add' | 'del', matches: (text: string) => boolean): DiffLine[][] {
  const runs: DiffLine[][] = [];
  let current: DiffLine[] = [];
  for (const line of lines) {
    if (line.kind === kind && matches(line.text)) {
      current.push(line);
    } else if (line.kind === kind || line.kind === 'context') {
      if (current.length > 0) runs.push(current);
      current = [];
    }
  }
  if (current.length > 0) runs.push(current);
  return runs;
}

function flag(rule: CustomRule, path: string, lines: LineRange | null, explanation: string): RiskFlag {
  return {
    id: `custom:${rule.id}:${path}:${lines === null ? 'file' : `${lines.side}${lines.start}`}`,
    source: 'custom',
    ruleId: `custom:${rule.id}`,
    category: 'custom',
    label: rule.name,
    severity: rule.severity,
    filePath: path,
    lines,
    explanation,
  };
}

// skip: files the built-in engine deprioritized (lockfiles, generated...). Line rules ignore
// them, as built-in line rules do; path rules still apply, since a path rule names files on purpose.
export function evaluateCustomRules(
  files: PrFile[],
  rules: CustomRule[],
  skip: ReadonlyMap<string, SkipReason | null> = new Map(),
): RiskFlag[] {
  const flags: RiskFlag[] = [];
  for (const rule of rules) {
    if (!rule.enabled || patternError(rule) !== null) continue;
    const explanation = rule.explanation.trim() === '' ? `Matches your rule "${rule.name}".` : rule.explanation.trim();

    for (const file of files) {
      const lines = file.patch === null ? [] : parsePatch(file.patch);

      if (rule.kind === 'path') {
        if (!pathMatches(rule.pattern, file.path)) continue;
        const first = lines.find((l) => l.kind === 'add') ?? lines.find((l) => l.kind === 'del');
        flags.push(flag(rule, file.path, first === undefined ? null : rangeOf([first]), explanation));
        continue;
      }

      if ((skip.get(file.path) ?? null) !== null) continue;
      const runs = matchingRuns(lines, rule.kind === 'added' ? 'add' : 'del', lineMatcher(rule));
      const extra = runs.length - MAX_FLAGS_PER_RULE_PER_FILE;
      runs.slice(0, MAX_FLAGS_PER_RULE_PER_FILE).forEach((run, i, shown) => {
        const text = i === shown.length - 1 && extra > 0 ? `${explanation} (${extra} more in this file.)` : explanation;
        flags.push(flag(rule, file.path, rangeOf(run), text));
      });
    }
  }
  return flags;
}
