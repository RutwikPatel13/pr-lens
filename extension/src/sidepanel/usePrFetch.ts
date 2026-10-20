import type { PrRef } from '@pr-lens/shared';
import { useEffect, useState } from 'react';
import { ApiError } from '../lib/api';

export type FetchState<T> = { status: 'loading' } | { status: 'loaded'; data: T } | { status: 'error'; error: ApiError };

type Fetcher<T> = (pr: PrRef, token: string, signal: AbortSignal) => Promise<T>;

// Fetches for the current PR, cancelling the previous request when the PR or token changes.
export function usePrFetch<T>(fetcher: Fetcher<T>, pr: PrRef, token: string): FetchState<T> {
  const [state, setState] = useState<FetchState<T>>({ status: 'loading' });
  const { owner, repo, number } = pr;

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });

    fetcher({ owner, repo, number }, token, controller.signal).then(
      (data) => setState({ status: 'loaded', data }),
      (err: unknown) => {
        if (controller.signal.aborted) return; // superseded by a newer PR or unmount
        const error = err instanceof ApiError ? err : new ApiError('internal', String(err));
        setState({ status: 'error', error });
      },
    );

    return () => controller.abort();
  }, [fetcher, owner, repo, number, token]);

  return state;
}
