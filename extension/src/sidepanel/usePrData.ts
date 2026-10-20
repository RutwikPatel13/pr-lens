import type { PrData, PrRef } from '@pr-lens/shared';
import { useEffect, useState } from 'react';
import { ApiError, fetchPrData } from '../lib/api';

export type PrDataState =
  | { status: 'loading' }
  | { status: 'loaded'; data: PrData }
  | { status: 'error'; error: ApiError };

export function usePrData(pr: PrRef, token: string): PrDataState {
  const [state, setState] = useState<PrDataState>({ status: 'loading' });
  const { owner, repo, number } = pr;

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });

    fetchPrData({ owner, repo, number }, token, controller.signal).then(
      (data) => setState({ status: 'loaded', data }),
      (err: unknown) => {
        if (controller.signal.aborted) return; // superseded by a newer PR or unmount
        const error = err instanceof ApiError ? err : new ApiError('internal', String(err));
        setState({ status: 'error', error });
      },
    );

    return () => controller.abort();
  }, [owner, repo, number, token]);

  return state;
}
