export type LlmRequest = {
  system: string;
  prompt: string;
  maxOutputTokens: number;
};

export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  // Returns the raw text of the reply. Throws LlmError for anything that isn't a reply.
  complete(request: LlmRequest): Promise<string>;
}

// rate_limited: try another provider, come back after retryAt.
// unavailable: 5xx, timeout or network error; worth one retry.
// auth: bad or revoked key. bad_request: the provider refused this request (too long, unsupported option).
// bad_output: replied, but not with valid JSON in the expected shape.
export type LlmErrorKind = 'rate_limited' | 'unavailable' | 'auth' | 'bad_request' | 'bad_output';

export class LlmError extends Error {
  constructor(
    readonly kind: LlmErrorKind,
    message: string,
    readonly retryAt?: Date,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };
