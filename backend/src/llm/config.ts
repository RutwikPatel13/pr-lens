import { geminiProvider } from './providers/gemini';
import { openAiCompatibleProvider } from './providers/openai-compatible';
import type { LlmProvider } from './types';

// Keys live in backend/.dev.vars locally and as Worker secrets in production.
export type LlmEnv = {
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  GROQ_API_KEY?: string;
  GROQ_MODEL?: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL?: string;
  // Comma-separated fallback order. Providers without a key are left out.
  LLM_PROVIDERS?: string;
};

const DEFAULT_ORDER = 'gemini,groq,openrouter';

// Defaults are each provider's free-tier model as of setup; override with the *_MODEL vars.
const DEFAULT_MODELS = {
  gemini: 'gemini-2.5-flash',
  groq: 'llama-3.3-70b-versatile',
  openrouter: 'meta-llama/llama-3.3-70b-instruct:free',
};

function provider(name: string, env: LlmEnv): LlmProvider | null {
  switch (name) {
    case 'gemini':
      return env.GEMINI_API_KEY ? geminiProvider(env.GEMINI_API_KEY, env.GEMINI_MODEL ?? DEFAULT_MODELS.gemini) : null;
    case 'groq':
      return env.GROQ_API_KEY
        ? openAiCompatibleProvider({
            name: 'groq',
            baseUrl: 'https://api.groq.com/openai/v1',
            apiKey: env.GROQ_API_KEY,
            model: env.GROQ_MODEL ?? DEFAULT_MODELS.groq,
            jsonMode: true,
          })
        : null;
    case 'openrouter':
      return env.OPENROUTER_API_KEY
        ? openAiCompatibleProvider({
            name: 'openrouter',
            baseUrl: 'https://openrouter.ai/api/v1',
            apiKey: env.OPENROUTER_API_KEY,
            model: env.OPENROUTER_MODEL ?? DEFAULT_MODELS.openrouter,
            jsonMode: false,
          })
        : null;
    default:
      throw new Error(`Unknown LLM provider "${name}" in LLM_PROVIDERS`);
  }
}

export function providersFromEnv(env: LlmEnv): LlmProvider[] {
  return (env.LLM_PROVIDERS ?? DEFAULT_ORDER)
    .split(',')
    .map((name) => provider(name.trim(), env))
    .filter((p): p is LlmProvider => p !== null);
}
