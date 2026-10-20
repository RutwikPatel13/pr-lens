import type { PrAnalysis } from '@pr-lens/shared';
import { describe, expect, it } from 'vitest';
import type { JsonCache } from '../src/cache/json-cache';
import { analysisKey, askKey, replyKey } from '../src/cache/keys';
import type { PrDetails, PullMeta } from '../src/github/pull-request';
import { PrService, type PrServiceDeps } from '../src/pr-service';
import { file, patch } from './risk/helpers';

class MemoryCache implements JsonCache {
  readonly store = new Map<string, string>();
  async get<T>(key: string) {
    const raw = this.store.get(key);
    return raw === undefined ? null : (JSON.parse(raw) as T);
  }
  async put(key: string, value: unknown) {
    this.store.set(key, JSON.stringify(value));
  }
}

const ref = { owner: 'Acme', repo: 'Shop', number: 7 };

function meta(headSha: string, isPublic = true): PullMeta {
  return {
    pr: { ...ref, title: `title at ${headSha}`, body: '', author: 'dev', url: 'u', state: 'open', headSha, baseRef: 'main', headRef: 'f', additions: 1, deletions: 0 },
    commitCount: 1,
    fileCount: 1,
    isPublic,
  };
}

const details: PrDetails = {
  commits: [{ sha: 'a', message: 'm', author: 'dev' }],
  files: [file('db/migrations/1.sql', patch(0, 1, ['+DROP TABLE users;']))],
  linkedIssues: [],
  truncated: { commits: false, files: false },
};

const result: Omit<PrAnalysis, 'generatedAt' | 'cached'> = {
  summary: { what: 'w', why: 'y', areas: [] }, reviewOrder: [], flags: [], notRead: [], truncated: [], models: ['fake/m'],
};

function setup(overrides: Partial<PrServiceDeps> = {}) {
  const calls = { meta: 0, details: 0, analyze: 0 };
  let head = 'sha1';
  let isPublic = true;
  const cache = new MemoryCache();
  const service = new PrService({
    fetchMeta: async () => (calls.meta++, meta(head, isPublic)),
    fetchDetails: async () => (calls.details++, details),
    analyze: async () => (calls.analyze++, result),
    cache,
    now: () => new Date('2026-10-19T12:00:00Z'),
    ...overrides,
  });
  return { service, calls, cache, push: (sha: string) => (head = sha), makePrivate: () => (isPublic = false) };
}

describe('PrService caching', () => {
  it('serves a repeat analysis from the cache without GitHub details or the model', async () => {
    const { service, calls } = setup();
    const first = await service.getAnalysis(ref);
    const second = await service.getAnalysis(ref);

    expect(first.cached).toBe(false);
    expect(second).toEqual({ ...first, cached: true });
    expect(calls).toEqual({ meta: 2, details: 1, analyze: 1 });
  });

  it('shares the cached details between the PR and analysis routes', async () => {
    const { service, calls } = setup();
    await service.getPr(ref);
    await service.getAnalysis(ref);
    expect(calls.details).toBe(1);
  });

  it('always uses fresh metadata, so an edited title shows even on a cache hit', async () => {
    const { service } = setup();
    await service.getPr(ref);
    const again = await service.getPr(ref);
    expect(again.pr.title).toBe('title at sha1');
    expect(again.risk.flags.map((f) => f.ruleId)).toEqual(['migration', 'destructive-sql']);
  });

  it('misses after a new commit is pushed', async () => {
    const { service, calls, push } = setup();
    await service.getAnalysis(ref);
    push('sha2');
    const after = await service.getAnalysis(ref);
    expect(after.cached).toBe(false);
    expect(calls.analyze).toBe(2);
  });

  it('never reads or writes the cache for a private repo', async () => {
    const { service, calls, cache, makePrivate } = setup();
    makePrivate();
    await service.getAnalysis(ref);
    await service.getAnalysis(ref);
    expect(calls.analyze).toBe(2);
    expect(cache.store.size).toBe(0);
  });

  it('refresh runs the model again and replaces the cached entry', async () => {
    const { service, calls } = setup();
    await service.getAnalysis(ref);
    const refreshed = await service.getAnalysis(ref, { refresh: true });
    expect(refreshed.cached).toBe(false);
    expect(calls.analyze).toBe(2);
    expect((await service.getAnalysis(ref)).cached).toBe(true);
  });

  it('keeps the earlier cached analysis when a refresh fails', async () => {
    let fail = false;
    const { service } = setup({ analyze: async () => (fail ? Promise.reject(new Error('busy')) : result) });
    const original = await service.getAnalysis(ref);
    fail = true;
    await expect(service.getAnalysis(ref, { refresh: true })).rejects.toThrow('busy');
    expect(await service.getAnalysis(ref)).toEqual({ ...original, cached: true });
  });

  it('does not cache a failed analysis', async () => {
    const failing = setup({ analyze: async () => Promise.reject(new Error('all providers busy')) });
    await expect(failing.service.getAnalysis(ref)).rejects.toThrow('all providers busy');
    expect([...failing.cache.store.keys()].some((k) => k.startsWith('analysis:'))).toBe(false);
  });

  it('keys ignore owner/repo case but include the version and head commit', () => {
    expect(analysisKey({ owner: 'Acme', repo: 'Shop', number: 7 }, 'abc')).toBe(analysisKey({ owner: 'acme', repo: 'shop', number: 7 }, 'abc'));
    expect(analysisKey(ref, 'abc')).toMatch(/^analysis:v\d+:acme\/shop#7@abc$/);
  });

  it('works with no cache configured', async () => {
    const { service, calls } = setup({ cache: null });
    await service.getAnalysis(ref);
    await service.getAnalysis(ref);
    expect(calls.analyze).toBe(2);
  });
});

describe('PrService.cached (Ask answers, suggested replies)', () => {
  it('computes once, then serves the stored value', async () => {
    const { service } = setup();
    let runs = 0;
    const compute = async () => (runs++, { answer: 'a' });
    expect(await service.cached('k', true, compute)).toEqual({ answer: 'a', cached: false });
    expect(await service.cached('k', true, compute)).toEqual({ answer: 'a', cached: true });
    expect(runs).toBe(1);
  });

  it('never caches for a private repo', async () => {
    const { service, cache } = setup();
    let runs = 0;
    const compute = async () => (runs++, { answer: 'a' });
    await service.cached('k', false, compute);
    await service.cached('k', false, compute);
    expect(runs).toBe(2);
    expect(cache.store.size).toBe(0);
  });

  it('stores nothing when the compute fails', async () => {
    const { service, cache } = setup();
    await expect(service.cached('k', true, async () => Promise.reject(new Error('busy')))).rejects.toThrow('busy');
    expect(cache.store.has('k')).toBe(false);
  });
});

describe('Ask and reply cache keys', () => {
  it('treats questions differing only in case and spacing as the same', async () => {
    const a = await askKey(ref, 'sha1', 'What could this break?');
    expect(await askKey(ref, 'sha1', '  what could   THIS break? ')).toBe(a);
    expect(await askKey(ref, 'sha1', 'What could this break')).not.toBe(a);
    expect(await askKey(ref, 'sha2', 'What could this break?')).not.toBe(a);
  });

  it('changes the reply key when the thread gets a new comment', () => {
    const before = replyKey(ref, 'sha1', 'T1', 2, '2026-10-01T00:00:00Z', 'Alice');
    expect(replyKey(ref, 'sha1', 'T1', 3, '2026-10-02T00:00:00Z', 'alice')).not.toBe(before);
    expect(replyKey(ref, 'sha2', 'T1', 2, '2026-10-01T00:00:00Z', 'alice')).not.toBe(before);
    // Written as someone else: a different reply.
    expect(replyKey(ref, 'sha1', 'T1', 2, '2026-10-01T00:00:00Z', 'bob')).not.toBe(before);
    expect(replyKey(ref, 'sha1', 'T1', 2, '2026-10-01T00:00:00Z', 'alice')).toBe(before);
  });
});
