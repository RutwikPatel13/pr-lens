import { describe, expect, it } from 'vitest';
import type { JsonCache } from '../src/cache/json-cache';
import { limitsFromEnv, QuotaExceededError, useQuota } from '../src/quota';

class MemoryCache implements JsonCache {
  readonly store = new Map<string, string>();
  async get<T>(key: string) {
    const raw = this.store.get(key);
    return raw === undefined ? null : (JSON.parse(raw) as T);
  }
  async put(key: string, value: unknown) {
    this.store.set(key, JSON.stringify(value));
  }
}

const limits = { perHour: 3, perDay: 5 };
const at = (iso: string) => new Date(iso);

describe('useQuota', () => {
  it('allows up to the hourly limit, then says when it resets', async () => {
    const cache = new MemoryCache();
    for (let i = 0; i < 3; i++) await useQuota(cache, 'Alice', limits, at('2026-10-20T10:05:00Z'));
    const error = await useQuota(cache, 'alice', limits, at('2026-10-20T10:59:00Z')).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(QuotaExceededError);
    expect((error as QuotaExceededError).resetAt.toISOString()).toBe('2026-10-20T11:00:00.000Z');
    expect((error as QuotaExceededError).message).toContain('3 an hour');
  });

  it('starts a new hour fresh, but still enforces the daily limit', async () => {
    const cache = new MemoryCache();
    for (let i = 0; i < 3; i++) await useQuota(cache, 'bob', limits, at('2026-10-20T10:05:00Z'));
    await useQuota(cache, 'bob', limits, at('2026-10-20T11:05:00Z'));
    await useQuota(cache, 'bob', limits, at('2026-10-20T11:06:00Z'));
    const error = await useQuota(cache, 'bob', limits, at('2026-10-20T12:00:00Z')).catch((e: unknown) => e);
    expect((error as QuotaExceededError).message).toContain('5 a day');
    expect((error as QuotaExceededError).resetAt.toISOString()).toBe('2026-10-21T00:00:00.000Z');
    // A new day starts over.
    await expect(useQuota(cache, 'bob', limits, at('2026-10-21T00:01:00Z'))).resolves.toBeUndefined();
  });

  it('counts each user separately and allows everything without a store', async () => {
    const cache = new MemoryCache();
    for (let i = 0; i < 3; i++) await useQuota(cache, 'carol', limits, at('2026-10-20T10:00:00Z'));
    await expect(useQuota(cache, 'dave', limits, at('2026-10-20T10:00:00Z'))).resolves.toBeUndefined();
    for (let i = 0; i < 10; i++) await useQuota(null, 'erin', limits, at('2026-10-20T10:00:00Z'));
  });

  it('reads limits from env, ignoring nonsense', () => {
    expect(limitsFromEnv({})).toEqual({ perHour: 30, perDay: 100 });
    expect(limitsFromEnv({ QUOTA_PER_HOUR: '10', QUOTA_PER_DAY: 'lots' })).toEqual({ perHour: 10, perDay: 100 });
  });
});
