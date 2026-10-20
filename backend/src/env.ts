import type { LlmEnv } from './llm/config';

// Worker bindings and vars. CACHE is optional so the app still runs (uncached) without KV.
export type AppEnv = LlmEnv & {
  CACHE?: KVNamespace;
};
