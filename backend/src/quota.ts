import type { JsonCache } from './cache/json-cache';

// Per-user limits on requests that run the LLM (cache hits are free). The backend is public and
// the LLM tiers are free, so the risk isn't cost: it's one person using up the shared quota.
// Users are their GitHub login, which the token they already send proves.

export type QuotaLimits = { perHour: number; perDay: number };

export const DEFAULT_LIMITS: QuotaLimits = { perHour: 30, perDay: 100 };

export class QuotaExceededError extends Error {
  constructor(
    readonly limit: string,
    readonly resetAt: Date,
  ) {
    super(`AI limit reached: ${limit}. Cached results still load.`);
    this.name = 'QuotaExceededError';
  }
}

// One KV key per user per day (one write per LLM request), holding the day's count and the
// current hour's. KV isn't atomic, so two simultaneous requests can both pass at the edge:
// a soft limit, which is all this needs.
type Usage = { day: number; hour: number; hourStart: number };

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export async function useQuota(store: JsonCache | null, login: string, limits: QuotaLimits, now: Date): Promise<void> {
  if (store === null) return;
  const dayStart = Math.floor(now.getTime() / DAY) * DAY;
  const hourStart = Math.floor(now.getTime() / HOUR) * HOUR;
  const key = `quota:${login.toLowerCase()}:${new Date(dayStart).toISOString().slice(0, 10)}`;

  const stored = await store.get<Usage>(key);
  const usage: Usage = stored ?? { day: 0, hour: 0, hourStart };
  if (usage.hourStart !== hourStart) {
    usage.hour = 0;
    usage.hourStart = hourStart;
  }

  if (usage.day >= limits.perDay) throw new QuotaExceededError(`${limits.perDay} a day`, new Date(dayStart + DAY));
  if (usage.hour >= limits.perHour) throw new QuotaExceededError(`${limits.perHour} an hour`, new Date(hourStart + HOUR));

  usage.day += 1;
  usage.hour += 1;
  await store.put(key, usage, 2 * 24 * 60 * 60);
}

export function limitsFromEnv(env: { QUOTA_PER_HOUR?: string; QUOTA_PER_DAY?: string }): QuotaLimits {
  const read = (value: string | undefined, fallback: number) => {
    const n = Number(value);
    return value !== undefined && Number.isInteger(n) && n > 0 ? n : fallback;
  };
  return { perHour: read(env.QUOTA_PER_HOUR, DEFAULT_LIMITS.perHour), perDay: read(env.QUOTA_PER_DAY, DEFAULT_LIMITS.perDay) };
}
