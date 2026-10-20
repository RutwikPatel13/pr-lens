import type { PrData } from '@pr-lens/shared';
import { file } from '../risk/helpers';
import { LlmError, type LlmProvider, type LlmRequest } from '../../src/llm/types';

type Step = string | LlmError | ((request: LlmRequest) => string);

// Replies with each step in turn (the last one repeats), recording every request.
export class FakeProvider implements LlmProvider {
  readonly requests: LlmRequest[] = [];
  constructor(
    readonly name: string,
    private readonly steps: Step[],
    readonly model = 'test-model',
  ) {}

  async complete(request: LlmRequest): Promise<string> {
    const step = this.steps[Math.min(this.requests.length, this.steps.length - 1)];
    this.requests.push(request);
    if (step === undefined) throw new Error('FakeProvider has no steps');
    if (step instanceof LlmError) throw step;
    return typeof step === 'function' ? step(request) : step;
  }
}

export function pr(files: PrData['files']): PrData {
  return {
    owner: 'acme', repo: 'shop', number: 7, title: 'Add refunds', body: 'Lets support refund orders.',
    author: 'dev', url: 'https://github.com/acme/shop/pull/7', state: 'open', headSha: 'abc', baseRef: 'main',
    headRef: 'refunds', additions: 10, deletions: 2, commits: [{ sha: 'abc', message: 'Add refunds', author: 'dev' }],
    files, linkedIssues: [], truncated: { commits: false, files: false },
  };
}

export { file };
