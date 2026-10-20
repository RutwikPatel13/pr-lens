export interface JsonCache {
  get<T>(key: string): Promise<T | null>;
  put(key: string, value: unknown, ttlSeconds: number): Promise<void>;
}

// A cache failure (KV's free plan allows 1,000 writes a day) shouldn't fail the request:
// it's logged and treated as a miss, and the work is done uncached.
export function kvCache(kv: KVNamespace): JsonCache {
  return {
    async get<T>(key: string) {
      try {
        return await kv.get<T>(key, 'json');
      } catch (err) {
        console.warn(`cache get failed for ${key}:`, err);
        return null;
      }
    },
    async put(key, value, ttlSeconds) {
      try {
        await kv.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds });
      } catch (err) {
        console.warn(`cache put failed for ${key}:`, err);
      }
    },
  };
}
