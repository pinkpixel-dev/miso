import { useCallback, useEffect, useState } from 'react';
import type { BackendStatus } from '../../shared/types.ts';
import { api } from './api.ts';

const POLL_INTERVAL_MS = 15_000;

/**
 * Tracks whether the backend is alive, rechecking on an interval and whenever
 * the tab regains focus.
 *
 * Polling is deliberately slow. The status banner is ambient information, and
 * from phase 4 onward a running job holds the server's single model lock, so a
 * chatty health check would be queueing behind real work.
 */
export function useBackendStatus() {
  const [status, setStatus] = useState<BackendStatus | undefined>();
  const [checking, setChecking] = useState(true);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      setStatus(await api.getBackendStatus());
    } catch (error) {
      setStatus({
        reachable: false,
        url: '',
        error: error instanceof Error ? error.message : 'The Miso service did not respond.',
      });
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void check();
    const timer = setInterval(() => void check(), POLL_INTERVAL_MS);
    const onFocus = () => void check();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [check]);

  return { status, checking, recheck: check };
}
