'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const INITIAL = { response: null, error: null, loading: true, lastUpdated: null };

/**
 * Poll an async fetcher on an interval, robustly:
 *  - each run aborts the previous in-flight request;
 *  - responses that arrive out of order are dropped (sequence number);
 *  - polling pauses while the tab is hidden and resumes immediately when it
 *    becomes visible again or the browser comes back online;
 *  - the last good response is kept when a refresh fails.
 *
 * @param {(signal: AbortSignal) => Promise<{data:any, stale?:boolean}>} fetcher
 *        Must be referentially stable (define it at module level).
 */
export function usePolling(fetcher, { interval = 60000, enabled = true } = {}) {
  const [state, setState] = useState(INITIAL);
  const sequence = useRef(0);
  const abortRef = useRef(null);

  const run = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const id = ++sequence.current;

    setState((previous) => ({ ...previous, loading: true }));

    try {
      const response = await fetcher(controller.signal);
      if (id !== sequence.current) return; // superseded
      setState({ response, error: null, loading: false, lastUpdated: new Date() });
    } catch (error) {
      if (id !== sequence.current || error?.name === 'AbortError') return;
      setState((previous) => ({
        ...previous,
        error: error?.message || 'Erreur inconnue',
        loading: false,
      }));
    }
  }, [fetcher]);

  useEffect(() => {
    if (!enabled) return undefined;

    const isVisible = () => typeof document === 'undefined' || document.visibilityState === 'visible';
    const runIfVisible = () => {
      if (isVisible()) run();
    };

    run();
    const timer = setInterval(runIfVisible, interval);
    document.addEventListener('visibilitychange', runIfVisible);
    window.addEventListener('online', run);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', runIfVisible);
      window.removeEventListener('online', run);
      sequence.current += 1; // drop anything still in flight
      abortRef.current?.abort();
    };
  }, [run, interval, enabled]);

  return {
    response: state.response,
    data: state.response?.data ?? null,
    stale: Boolean(state.response?.stale),
    error: state.error,
    loading: state.loading,
    lastUpdated: state.lastUpdated,
    refresh: run,
  };
}
