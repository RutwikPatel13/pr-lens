import type { FileRole, PrAnalysis, PrData, ReviewStep, RiskFlag, RiskReport } from '@pr-lens/shared';
import { DEFAULT_LIMITS, planChunks, type ChunkLimits, type PromptFile } from './chunking';
import type { FallbackLlm } from './fallback';
import { mapRequest, reduceRequest } from './prompts';
import { parseMapOutput, parseReduceOutput, ROLES, type MapFileNotes } from './schemas';

// Map calls in flight at once. Free tiers allow roughly 10-30 requests a minute.
const MAP_CONCURRENCY = 2;

async function mapInBatches<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    results.push(...(await Promise.all(items.slice(i, i + limit).map(fn))));
  }
  return results;
}

// Model-cited lines are kept only if they exist in the diff the model was shown.
function toFlags(notes: MapFileNotes[], files: Map<string, PromptFile>): RiskFlag[] {
  return notes.flatMap((note) =>
    note.concerns.slice(0, 3).map((concern, i): RiskFlag => {
      const ref = concern.line?.trim().toUpperCase() ?? null;
      const valid = ref !== null && /^[LR]\d+$/.test(ref) && (files.get(note.path)?.lineRefs.has(ref) ?? false);
      const lines = valid && ref !== null
        ? { side: ref.startsWith('R') ? ('RIGHT' as const) : ('LEFT' as const), start: Number(ref.slice(1)), end: Number(ref.slice(1)) }
        : null;
      return {
        id: `llm:${note.path}:${i}`,
        source: 'llm',
        ruleId: 'llm',
        category: concern.category,
        severity: concern.severity,
        filePath: note.path,
        lines,
        explanation: concern.explanation,
      };
    }),
  );
}

// Keeps the model's order for paths it knows, then appends any file it left out by role.
function normalizeReviewOrder(steps: { path: string; reason: string }[], notes: MapFileNotes[]): ReviewStep[] {
  const roleOf = new Map(notes.map((n) => [n.path, n.role]));
  const seen = new Set<string>();
  const ordered: ReviewStep[] = [];

  for (const step of steps) {
    const role = roleOf.get(step.path);
    if (role === undefined || seen.has(step.path)) continue;
    seen.add(step.path);
    ordered.push({ path: step.path, role, reason: step.reason });
  }

  const rank = (role: FileRole) => ROLES.indexOf(role);
  const missing = notes.filter((n) => !seen.has(n.path)).sort((a, b) => rank(a.role) - rank(b.role));
  for (const note of missing) ordered.push({ path: note.path, role: note.role, reason: note.summary });
  return ordered;
}

export async function analyzePr(llm: FallbackLlm, pr: PrData, risk: RiskReport, limits: ChunkLimits = DEFAULT_LIMITS): Promise<PrAnalysis> {
  const plan = planChunks(pr, risk, limits);
  const models: string[] = [];
  const promptFiles = new Map(plan.chunks.flat().map((f) => [f.path, f]));

  const mapped = await mapInBatches(plan.chunks, MAP_CONCURRENCY, async (chunk) => {
    const { value, model } = await llm.completeJson(mapRequest(pr, chunk), (text) =>
      parseMapOutput(text, chunk.map((f) => f.path)),
    );
    models.push(model);
    return value;
  });
  const notes = mapped.flat();

  const { value: reduced, model } = await llm.completeJson(reduceRequest(pr, notes, plan.notRead), parseReduceOutput);
  models.push(model);

  return {
    summary: { what: reduced.what, why: reduced.why, areas: reduced.areas.slice(0, 6) },
    reviewOrder: normalizeReviewOrder(reduced.reviewOrder, notes),
    flags: toFlags(notes, promptFiles),
    notRead: plan.notRead,
    truncated: plan.truncated,
    models: [...new Set(models)],
  };
}
