import { useCallback, useEffect, useRef } from "react";

/**
 * Coalesces bursts of calls into one, `ms` after the last call. Used for
 * realtime handlers: when hundreds of players answer or get eliminated at
 * once, we refetch once instead of once per event.
 */
export function useDebounced(fn: () => void, ms: number) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => fnRef.current(), ms);
  }, [ms]);
}
