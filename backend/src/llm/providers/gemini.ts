import { LlmError, type LlmProvider } from '../types';
import { postJson } from './http';

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
};

export function geminiProvider(apiKey: string, model: string): LlmProvider {
  return {
    name: 'gemini',
    model,
    async complete(request) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const body = (await postJson('gemini', url, { 'x-goog-api-key': apiKey }, {
        systemInstruction: { parts: [{ text: request.system }] },
        contents: [{ role: 'user', parts: [{ text: request.prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          maxOutputTokens: request.maxOutputTokens,
          temperature: 0.2,
          // Gemini 3 models think by default, which is slow and spends output tokens. Older models reject this field.
          ...(model.startsWith('gemini-3') ? { thinkingConfig: { thinkingLevel: 'low' } } : {}),
        },
      })) as GeminiResponse;

      const candidate = body.candidates?.[0];
      const text = candidate?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
      if (text === '') {
        const reason = body.promptFeedback?.blockReason ?? candidate?.finishReason ?? 'no candidates';
        throw new LlmError('bad_output', `gemini: empty reply (${reason})`);
      }
      return text;
    },
  };
}
