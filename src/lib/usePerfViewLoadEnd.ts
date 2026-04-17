import { useEffect, useRef } from 'react';

import { flushPerfForView, hasPendingPerf } from './perfLogging';

type Params = {
  path: string;
  label: string;
  isLoading: boolean;
  meta?: Record<string, unknown>;
  /** Tiempo de gracia para evitar logs prematuros si el loading empieza justo después del mount. */
  graceMs?: number;
};

export function usePerfViewLoadEnd({
  path,
  label,
  isLoading,
  meta,
  graceMs = 0,
}: Params): void {
  const loggedRef = useRef(false);
  const sawLoadingRef = useRef(false);
  const graceTimerRef = useRef<number | null>(null);
  const latestIsLoadingRef = useRef(isLoading);

  latestIsLoadingRef.current = isLoading;

  useEffect(() => {
    if (loggedRef.current) {
      return;
    }

    if (!hasPendingPerf(path)) {
      return;
    }

    if (isLoading) {
      sawLoadingRef.current = true;
      if (graceTimerRef.current != null) {
        window.clearTimeout(graceTimerRef.current);
        graceTimerRef.current = null;
      }
      return;
    }

    if (sawLoadingRef.current) {
      loggedRef.current = flushPerfForView({ path, label, meta });
      return;
    }

    if (graceMs <= 0) {
      loggedRef.current = flushPerfForView({ path, label, meta });
      return;
    }

    // Si aún no vimos loading, damos un pequeño margen para que el estado
    // cambie a loading (por efectos que disparan fetch) y no loguear prematuro.
    if (graceTimerRef.current == null) {
      graceTimerRef.current = window.setTimeout(() => {
        graceTimerRef.current = null;
        if (loggedRef.current) return;
        if (latestIsLoadingRef.current) return;
        loggedRef.current = flushPerfForView({ path, label, meta });
      }, graceMs);
    }

    return () => {
      if (graceTimerRef.current != null) {
        window.clearTimeout(graceTimerRef.current);
        graceTimerRef.current = null;
      }
    };
  }, [path, label, isLoading, meta, graceMs]);
}
