import type { FileRole, RiskCategory, Severity } from '@pr-lens/shared';
import { z } from 'zod';
import type { ParseResult } from './types';

export const ROLES = ['schema', 'config', 'core', 'api', 'ui', 'test', 'docs', 'other'] as const satisfies readonly FileRole[];
const CATEGORIES = ['schema', 'auth', 'payments', 'config', 'dependencies', 'tests', 'secrets', 'logic'] as const satisfies readonly RiskCategory[];
const SEVERITIES = ['high', 'medium', 'low'] as const satisfies readonly Severity[];

// .catch() on enums: small models sometimes invent a role like "service". That's not worth a retry.
const MapOutput = z.object({
  files: z.array(
    z.object({
      path: z.string(),
      role: z.enum(ROLES).catch('other'),
      summary: z.string(),
      concerns: z
        .array(
          z.object({
            line: z.string().nullable().catch(null),
            category: z.enum(CATEGORIES).catch('logic'),
            severity: z.enum(SEVERITIES).catch('medium'),
            explanation: z.string(),
          }),
        )
        .catch([]),
    }),
  ),
});
export type MapFileNotes = z.infer<typeof MapOutput>['files'][number];

const ReduceOutput = z.object({
  what: z.string().min(1),
  why: z.string(),
  areas: z.array(z.string()).catch([]),
  reviewOrder: z.array(z.object({ path: z.string(), reason: z.string() })),
});
export type ReduceResult = z.infer<typeof ReduceOutput>;

// Models wrap JSON in ```json fences or add a sentence around it often enough to handle here.
export function extractJson(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)?.[1];
  const candidate = fenced ?? text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  return start === -1 || end < start ? candidate : candidate.slice(start, end + 1);
}

function parseWith<T>(schema: z.ZodType<T>, text: string): ParseResult<T> {
  let json: unknown;
  try {
    json = JSON.parse(extractJson(text));
  } catch {
    return { ok: false, error: 'reply is not valid JSON' };
  }
  const result = schema.safeParse(json);
  return result.success ? { ok: true, value: result.data } : { ok: false, error: z.prettifyError(result.error) };
}

export function parseMapOutput(text: string, expectedPaths: string[]): ParseResult<MapFileNotes[]> {
  const parsed = parseWith(MapOutput, text);
  if (!parsed.ok) return parsed;

  const expected = new Set(expectedPaths);
  const files = parsed.value.files.filter((f) => expected.has(f.path));
  const missing = expectedPaths.filter((p) => !files.some((f) => f.path === p));
  if (missing.length > 0) return { ok: false, error: `missing notes for: ${missing.join(', ')}` };
  return { ok: true, value: files };
}

export function parseReduceOutput(text: string): ParseResult<ReduceResult> {
  return parseWith(ReduceOutput, text);
}
