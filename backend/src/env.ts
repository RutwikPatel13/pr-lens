import type { LlmEnv } from './llm/config';

// Worker bindings and vars. CACHE is optional so the app still runs (uncached) without KV.
export type AppEnv = LlmEnv & {
  CACHE?: KVNamespace;
  // Comma-separated extension IDs allowed by CORS (see cors.ts). Set in wrangler.jsonc vars.
  ALLOWED_EXTENSION_IDS?: string;
  // Per-user LLM request limits (quota.ts). Defaults 30 and 100.
  QUOTA_PER_HOUR?: string;
  QUOTA_PER_DAY?: string;
};
