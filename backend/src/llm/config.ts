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
  // Comma-separated fallback order. Each entry is a provider name (uses its *_MODEL) or
  // provider:model. Providers without a key are left out.
  LLM_PROVIDERS?: string;
};

// Groq first: on 2026-10-19 it answered in ~0.4s while Gemini's free tier returned 503
// "high demand" on most calls and took ~60s on the rest. Groq's free limit is 8k tokens a
// minute per model, so a second Groq model doubles that before Gemini takes the overflow.
// See docs/decisions.md.
const DEFAULT_ORDER = 'groq,groq:openai/gpt-oss-20b,gemini,openrouter';

// Checked against each provider's model list on 2026-10-19. Override with the *_MODEL vars.
// (gemini-2.5-flash is listed but returns 404 for new API keys.)
const DEFAULT_MODELS = {
  gemini: 'gemini-3.8-flash',
  groq: 'openai/gpt-oss-120b',
  // Not verified yet: no OpenRouter key configured.
  openrouter: 'meta-llama/llama-3.3-70b-instruct:free',
};

function provider(entry: string, env: LlmEnv): LlmProvider | null {
  const colon = entry.indexOf(':');
  const name = colon === -1 ? entry : entry.slice(0, colon);
  const model = colon === -1 ? null : entry.slice(colon + 1);

  switch (name) {
    case 'gemini':
      return env.GEMINI_API_KEY ? geminiProvider(env.GEMINI_API_KEY, model ?? env.GEMINI_MODEL ?? DEFAULT_MODELS.gemini) : null;
    case 'groq': {
      const groqModel = model ?? env.GROQ_MODEL ?? DEFAULT_MODELS.groq;
      return env.GROQ_API_KEY
        ? openAiCompatibleProvider({
            name: 'groq',
            baseUrl: 'https://api.groq.com/openai/v1',
            apiKey: env.GROQ_API_KEY,
            model: groqModel,
            jsonMode: true,
            // gpt-oss reasons before answering; "low" keeps that inside the free per-minute token limit.
            ...(groqModel.startsWith('openai/gpt-oss') ? { extraBody: { reasoning_effort: 'low' } } : {}),
          })
        : null;
    }
    case 'openrouter':
      return env.OPENROUTER_API_KEY
        ? openAiCompatibleProvider({
            name: 'openrouter',
            baseUrl: 'https://openrouter.ai/api/v1',
            apiKey: env.OPENROUTER_API_KEY,
            model: model ?? env.OPENROUTER_MODEL ?? DEFAULT_MODELS.openrouter,
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
    .map((entry) => provider(entry.trim(), env))
    .filter((p): p is LlmProvider => p !== null);
}
