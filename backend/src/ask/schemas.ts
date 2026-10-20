import { z } from 'zod';
import { extractJson } from '../llm/schemas';
import type { ParseResult } from '../llm/types';

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

const Plan = z.object({
  search: z.array(z.string()).catch([]),
  files: z.array(z.string()).catch([]),
});
export type AskPlan = z.infer<typeof Plan>;

export function parsePlan(text: string): ParseResult<AskPlan> {
  const parsed = parseWith(Plan, text);
  if (!parsed.ok) return parsed;
  // Code search wants short identifiers or phrases; anything else is noise.
  const search = parsed.value.search
    .map((s) => s.trim().replace(/^[`'"]+|[`'"]+$/g, ''))
    .filter((s) => s.length >= 2 && s.length <= 60)
    .slice(0, 3);
  const files = parsed.value.files
    .map((f) => f.trim().replace(/^\/+/, ''))
    .filter((f) => f.length > 0 && !f.includes('..'))
    .slice(0, 3);
  return { ok: true, value: { search, files } };
}

const Answer = z.object({
  answer: z.string().min(1),
  sources: z
    .array(z.object({ path: z.string(), line: z.string().nullable().catch(null) }))
    .catch([]),
});
export type RawAnswer = z.infer<typeof Answer>;

export function parseAnswer(text: string): ParseResult<RawAnswer> {
  return parseWith(Answer, text);
}

const Reply = z.object({ reply: z.string().min(1), reason: z.string() });
export type RawReply = z.infer<typeof Reply>;

export function parseReply(text: string): ParseResult<RawReply> {
  return parseWith(Reply, text);
}
