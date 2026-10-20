import { describe, expect, it } from 'vitest';
import { providersFromEnv } from '../../src/llm/config';

const names = (env: Parameters<typeof providersFromEnv>[0]) => providersFromEnv(env).map((p) => `${p.name}/${p.model}`);

describe('providersFromEnv', () => {
  it('uses two Groq models (separate free quotas) before Gemini by default, skipping providers without keys', () => {
    expect(names({ GROQ_API_KEY: 'g', GEMINI_API_KEY: 'k' })).toEqual([
      'groq/openai/gpt-oss-120b',
      'groq/openai/gpt-oss-20b',
      'gemini/gemini-3.8-flash',
    ]);
    expect(names({ GEMINI_API_KEY: 'k' })).toEqual(['gemini/gemini-3.8-flash']);
    expect(names({})).toEqual([]);
  });

  it('accepts provider:model entries and plain names that use the *_MODEL default', () => {
    expect(names({ GROQ_API_KEY: 'g', GROQ_MODEL: 'm1', LLM_PROVIDERS: 'groq, groq:org/m2' })).toEqual(['groq/m1', 'groq/org/m2']);
  });

  it('rejects unknown provider names', () => {
    expect(() => providersFromEnv({ LLM_PROVIDERS: 'grok' })).toThrow('Unknown LLM provider "grok"');
  });
});
