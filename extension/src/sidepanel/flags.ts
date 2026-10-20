import type { RiskFlag, Severity } from '@pr-lens/shared';

const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

const location = (flag: RiskFlag) =>
  `${flag.filePath}:${flag.lines === null ? 'file' : `${flag.lines.side}${flag.lines.start}`}`;

export type MergedFlags = {
  // Rule flags plus LLM flags on lines no rule flagged, most severe first.
  flags: RiskFlag[];
  // LLM explanations for lines a rule already flagged, by the id of the rule flag they go under.
  notes: Map<string, string[]>;
  counts: Record<Severity, number>;
};

// Rule flags arrive first; LLM flags join once the analysis finishes. An LLM flag on the same
// line as a rule flag becomes a note under it (the model is usually adding context), so the
// list doesn't show the same line twice.
export function mergeFlags(ruleFlags: RiskFlag[], llmFlags: RiskFlag[]): MergedFlags {
  const ruleLocations = new Set(ruleFlags.map(location));
  const notesByLocation = new Map<string, string[]>();
  const separate: RiskFlag[] = [];
  for (const flag of llmFlags) {
    const key = location(flag);
    if (ruleLocations.has(key)) notesByLocation.set(key, [...(notesByLocation.get(key) ?? []), flag.explanation]);
    else separate.push(flag);
  }

  const flags = [...ruleFlags, ...separate].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || (a.lines?.start ?? 0) - (b.lines?.start ?? 0),
  );

  // Several rule flags can share a line; the notes go under the first one shown.
  const notes = new Map<string, string[]>();
  const placed = new Set<string>();
  for (const flag of flags) {
    const key = location(flag);
    const forLine = notesByLocation.get(key);
    if (flag.source !== 'rule' || forLine === undefined || placed.has(key)) continue;
    notes.set(flag.id, forLine);
    placed.add(key);
  }

  const counts: Record<Severity, number> = { high: 0, medium: 0, low: 0 };
  for (const flag of flags) counts[flag.severity]++;
  return { flags, notes, counts };
}

// Groups flags by file, files ordered by their most severe flag.
export function groupByFile(flags: RiskFlag[]): { path: string; flags: RiskFlag[] }[] {
  const groups = new Map<string, RiskFlag[]>();
  for (const flag of flags) groups.set(flag.filePath, [...(groups.get(flag.filePath) ?? []), flag]);
  return [...groups].map(([path, fileFlags]) => ({ path, flags: fileFlags }));
}
