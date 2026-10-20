import { LlmError, type LlmProvider } from '../types';
import { postJson } from './http';

type ChatCompletion = {
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
};

type Options = {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  // response_format json_object. Groq supports it; many OpenRouter free models reject it.
  jsonMode: boolean;
  // Provider-specific request fields, e.g. Groq's reasoning_effort for gpt-oss models.
  extraBody?: Record<string, unknown>;
};

// Groq and OpenRouter both speak the OpenAI chat completions format.
export function openAiCompatibleProvider({ name, baseUrl, apiKey, model, jsonMode, extraBody }: Options): LlmProvider {
  return {
    name,
    model,
    async complete(request) {
      const body = (await postJson(name, `${baseUrl}/chat/completions`, { Authorization: `Bearer ${apiKey}` }, {
        model,
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.prompt },
        ],
        temperature: 0.2,
        max_tokens: request.maxOutputTokens,
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
        ...extraBody,
      })) as ChatCompletion;

      const choice = body.choices?.[0];
      const text = choice?.message?.content ?? '';
      if (text === '') throw new LlmError('bad_output', `${name}: empty reply (${choice?.finish_reason ?? 'no choices'})`);
      return text;
    },
  };
}
