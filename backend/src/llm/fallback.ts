import { LlmError, type LlmProvider, type LlmRequest, type ParseResult } from './types';

const AUTH_FAILURE_COOLDOWN_MS = 10 * 60_000;
// After a call and its retry both fail with 5xx/timeouts, skip the provider for a while
// instead of paying for two more failures on every chunk.
const UNAVAILABLE_COOLDOWN_MS = 30_000;
// A rate limit that resets this soon is waited out on the same provider rather than switching:
// on free tiers the next provider is often much slower (Gemini took ~60s per call on 2026-10-19).
// Also used when every provider is cooling down.
const MAX_WAIT_MS = 20_000;

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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

// Tries providers in order. Each provider gets one retry: after a 5xx, after a rate limit
// that resets within MAX_WAIT_MS (waited out), or after a reply that fails validation (with
// the validation error added to the prompt). Otherwise a failing provider cools down and the
// next one takes over. If every provider is cooling down and one frees up within
// MAX_WAIT_MS, it waits once rather than failing.
export class FallbackLlm {
  constructor(
    private readonly providers: LlmProvider[],
    private readonly cooldowns: CooldownStore = isolateCooldowns,
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = realSleep,
  ) {
    if (providers.length === 0) throw new LlmNotConfiguredError();
  }

  async completeJson<T>(request: LlmRequest, parse: (text: string) => ParseResult<T>): Promise<{ value: T; model: string }> {
    const failures: string[] = [];
    const keys = this.providers.map(providerKey);

    for (let round = 0; round < 2; round++) {
      const result = await this.tryAll(request, parse, failures);
      if (result !== null) return result;

      const nextFree = this.cooldowns.nextFree(keys);
      const wait = nextFree === null ? 0 : nextFree.getTime() - this.now();
      if (round > 0 || nextFree === null || wait > MAX_WAIT_MS) break;
      await this.sleep(wait);
    }

    throw new AllProvidersFailedError(failures, this.cooldowns.nextFree(keys));
  }

  private async tryAll<T>(
    request: LlmRequest,
    parse: (text: string) => ParseResult<T>,
    failures: string[],
  ): Promise<{ value: T; model: string } | null> {
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
        if (err.kind === 'unavailable' || err.kind === 'timeout') {
          this.cooldowns.cool(key, new Date(this.now() + UNAVAILABLE_COOLDOWN_MS));
        }
      }
    }
    return null;
  }

  private async tryProvider<T>(provider: LlmProvider, request: LlmRequest, parse: (text: string) => ParseResult<T>): Promise<T> {
    let current = request;
    let lastError = '';

    const withError = (error: string): LlmRequest => ({
      ...request,
      prompt: `${request.prompt}\n\nYour previous reply was not valid: ${error}\nReply again with only the JSON object, in exactly the shape described.`,
    });

    for (let attempt = 0; attempt < 2; attempt++) {
      let text: string;
      try {
        text = await provider.complete(current);
      } catch (err) {
        if (!(err instanceof LlmError) || attempt > 0) throw err;
        if (err.kind === 'unavailable') continue;
        if (err.kind === 'bad_output') {
          lastError = err.message;
          current = withError(err.message);
          continue;
        }
        const wait = err.kind === 'rate_limited' && err.retryAt !== undefined ? err.retryAt.getTime() - this.now() : null;
        if (wait !== null && wait <= MAX_WAIT_MS) {
          await this.sleep(Math.max(wait, 0));
          continue;
        }
        throw err;
      }

      const result = parse(text);
      if (result.ok) return result.value;
      lastError = result.error;
      current = withError(result.error);
    }

    throw new LlmError('bad_output', `${providerKey(provider)}: invalid output after retry (${lastError})`);
  }
}
