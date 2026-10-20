import { LlmError, type LlmProvider, type LlmRequest, type ParseResult } from './types';

const AUTH_FAILURE_COOLDOWN_MS = 10 * 60_000;

// When each provider can be tried again. Lives per Worker isolate, so it's best-effort:
// a fresh isolate starts with no cooldowns and finds out from the provider's next 429.
export class CooldownStore {
  private readonly until = new Map<string, number>();

  constructor(private readonly now: () => number = Date.now) {}

  isCooling(key: string): boolean {
    return (this.until.get(key) ?? 0) > this.now();
  }

  cool(key: string, until: Date): void {
    this.until.set(key, Math.max(until.getTime(), this.until.get(key) ?? 0));
  }

  // The earliest time any of these providers frees up, or null if one is free now.
  nextFree(keys: string[]): Date | null {
    if (keys.some((k) => !this.isCooling(k))) return null;
    return new Date(Math.min(...keys.map((k) => this.until.get(k) ?? 0)));
  }
}

export const isolateCooldowns = new CooldownStore();

export class AllProvidersFailedError extends Error {
  constructor(
    readonly failures: string[],
    readonly nextFree: Date | null,
  ) {
    super(`All LLM providers failed: ${failures.join('; ')}`);
    this.name = 'AllProvidersFailedError';
  }
}

export class LlmNotConfiguredError extends Error {
  constructor() {
    super('No LLM provider keys are configured on the backend.');
    this.name = 'LlmNotConfiguredError';
  }
}

const providerKey = (p: LlmProvider) => `${p.name}/${p.model}`;

// Tries providers in order. A rate-limited provider cools down until its reset time and the
// next one takes over. Each provider gets one retry: after a 5xx/timeout, or after a reply
// that fails validation (with the validation error added to the prompt).
export class FallbackLlm {
  constructor(
    private readonly providers: LlmProvider[],
    private readonly cooldowns: CooldownStore = isolateCooldowns,
    private readonly now: () => number = Date.now,
  ) {
    if (providers.length === 0) throw new LlmNotConfiguredError();
  }

  async completeJson<T>(request: LlmRequest, parse: (text: string) => ParseResult<T>): Promise<{ value: T; model: string }> {
    const failures: string[] = [];

    for (const provider of this.providers) {
      const key = providerKey(provider);
      if (this.cooldowns.isCooling(key)) {
        failures.push(`${key}: cooling down`);
        continue;
      }
      try {
        return { value: await this.tryProvider(provider, request, parse), model: key };
      } catch (err) {
        if (!(err instanceof LlmError)) throw err;
        failures.push(err.message);
        if (err.kind === 'rate_limited') this.cooldowns.cool(key, err.retryAt ?? new Date(this.now() + 60_000));
        if (err.kind === 'auth') this.cooldowns.cool(key, new Date(this.now() + AUTH_FAILURE_COOLDOWN_MS));
      }
    }

    throw new AllProvidersFailedError(failures, this.cooldowns.nextFree(this.providers.map(providerKey)));
  }

  private async tryProvider<T>(provider: LlmProvider, request: LlmRequest, parse: (text: string) => ParseResult<T>): Promise<T> {
    let current = request;
    let lastError = '';

    for (let attempt = 0; attempt < 2; attempt++) {
      let text: string;
      try {
        text = await provider.complete(current);
      } catch (err) {
        if (err instanceof LlmError && err.kind === 'unavailable' && attempt === 0) continue;
        throw err;
      }

      const result = parse(text);
      if (result.ok) return result.value;
      lastError = result.error;
      current = {
        ...request,
        prompt: `${request.prompt}\n\nYour previous reply was not valid: ${result.error}\nReply again with only the JSON object, in exactly the shape described.`,
      };
    }

    throw new LlmError('bad_output', `${providerKey(provider)}: invalid output after retry (${lastError})`);
  }
}
