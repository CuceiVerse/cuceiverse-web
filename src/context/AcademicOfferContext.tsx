import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import {
  fetchSessionSiiauSnapshot,
  fetchSnapshotMe,
  SIIAU_LAST_NIP_STORAGE_KEY,
} from '../features/siiau/api/siiau';
import { useAuth } from './useAuth';
import {
  ACADEMIC_OFFER_IDLE_STATE,
  AcademicOfferContext,
  type AcademicOfferRecord,
  type AcademicOfferState,
} from './AcademicOfferContextStore';

const POLL_INTERVAL_MS = 1500;
const MAX_POLL_ATTEMPTS = 50;

function shortToken(token: string | null): string {
  if (!token) return 'null';
  return token.length <= 16 ? token : `${token.slice(0, 8)}...${token.slice(-8)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export const AcademicOfferProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { token: authToken } = useAuth();
  const [state, setState] = useState<AcademicOfferState>(ACADEMIC_OFFER_IDLE_STATE);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const sessionVersionRef = useRef(0);

  useEffect(() => {
    // Invalida cualquier polling en vuelo y limpia datos al cambiar de sesion.
    sessionVersionRef.current += 1;
    inFlightRef.current = null;
    setState(ACADEMIC_OFFER_IDLE_STATE);

    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log('[SIIAU][WEB] token/session cambio detectado', {
        sessionVersion: sessionVersionRef.current,
        token: shortToken(authToken),
      });
    }
  }, [authToken]);

  const resetAcademicOffer = useCallback(() => {
    setState(ACADEMIC_OFFER_IDLE_STATE);
  }, []);

  const loadAcademicOffer = useCallback(
    async (
      token: string,
      options?: { force?: boolean; offerRecords?: AcademicOfferRecord[] },
    ) => {
      const force = options?.force === true;
      const nextOfferRecords = options?.offerRecords;

      if (nextOfferRecords && nextOfferRecords.length > 0) {
        setState((prev) => ({
          ...prev,
          offerRecords: nextOfferRecords,
        }));
      }

      if (!token) {
        setState({
          status: 'error',
          offerRecords: nextOfferRecords ?? state.offerRecords,
          snapshot: null,
          error: 'No hay sesión activa para cargar la oferta académica.',
          requestedAt: null,
          updatedAt: null,
        });
        return;
      }

      if (!force && (state.status === 'loading' || state.status === 'ready')) {
        return;
      }

      if (inFlightRef.current && !force) {
        await inFlightRef.current;
        return;
      }

      const run = async () => {
        const runSessionVersion = sessionVersionRef.current;
        const isStale = () => runSessionVersion !== sessionVersionRef.current;

        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.log('[SIIAU][WEB] loadAcademicOffer start', {
            runSessionVersion,
            currentSessionVersion: sessionVersionRef.current,
            force,
            token: shortToken(token),
          });
        }

        if (isStale()) {
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.log('[SIIAU][WEB] loadAcademicOffer abort stale antes de polling', {
              runSessionVersion,
              currentSessionVersion: sessionVersionRef.current,
            });
          }
          return;
        }

        setState((prev) => ({
          ...prev,
          status: 'loading',
          error: null,
        }));

        let lastKnownRequestedAt: string | null = null;
        let lastKnownUpdatedAt: string | null = null;

        const tryDirectSnapshotFallback = async (reason: string): Promise<boolean> => {
          if (!force) return false;

          const nip = sessionStorage.getItem(SIIAU_LAST_NIP_STORAGE_KEY)?.trim() ?? '';
          if (!nip) {
            if (import.meta.env.DEV) {
              // eslint-disable-next-line no-console
              console.log('[SIIAU][WEB] fallback snapshot/me omitido: no hay NIP en sessionStorage', {
                reason,
              });
            }
            return false;
          }

          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.log('[SIIAU][WEB] fallback snapshot/me ejecutando', {
              reason,
              runSessionVersion,
              requestedAt: lastKnownRequestedAt,
              updatedAt: lastKnownUpdatedAt,
            });
          }

          try {
            const directSnapshot = await fetchSnapshotMe(token, nip);
            if (isStale()) {
              if (import.meta.env.DEV) {
                // eslint-disable-next-line no-console
                console.log('[SIIAU][WEB] fallback snapshot/me descartado por stale session', {
                  reason,
                  runSessionVersion,
                  currentSessionVersion: sessionVersionRef.current,
                });
              }
              return true;
            }

            const now = new Date().toISOString();
            setState({
              status: 'ready',
              offerRecords: nextOfferRecords ?? state.offerRecords,
              snapshot: directSnapshot,
              error: null,
              requestedAt: lastKnownRequestedAt ?? now,
              updatedAt: now,
            });
            return true;
          } catch (directError) {
            if (import.meta.env.DEV) {
              // eslint-disable-next-line no-console
              console.log('[SIIAU][WEB] fallback snapshot/me fallo', {
                reason,
                message:
                  directError instanceof Error
                    ? directError.message
                    : 'No fue posible consultar snapshot/me',
              });
            }
            return false;
          }
        };

        for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
          try {
            if (import.meta.env.DEV) {
              // eslint-disable-next-line no-console
              console.log('[SIIAU][WEB] polling attempt', {
                attempt,
                runSessionVersion,
                currentSessionVersion: sessionVersionRef.current,
              });
            }

            const next = await fetchSessionSiiauSnapshot(token);
            if (isStale()) {
              if (import.meta.env.DEV) {
                // eslint-disable-next-line no-console
                console.log('[SIIAU][WEB] respuesta descartada por stale session', {
                  attempt,
                  runSessionVersion,
                  currentSessionVersion: sessionVersionRef.current,
                });
              }
              return;
            }

            lastKnownRequestedAt = next.requestedAt;
            lastKnownUpdatedAt = next.updatedAt;

            if (next.status === 'ready' && next.snapshot) {
              setState({
                status: 'ready',
                offerRecords: nextOfferRecords ?? state.offerRecords,
                snapshot: next.snapshot,
                error: null,
                requestedAt: next.requestedAt,
                updatedAt: next.updatedAt,
              });
              return;
            }

            if (next.status === 'error') {
              const recovered = await tryDirectSnapshotFallback('status-error');
              if (recovered) return;

              setState({
                status: 'error',
                offerRecords: nextOfferRecords ?? state.offerRecords,
                snapshot: null,
                error: next.error ?? 'No fue posible cargar la oferta académica.',
                requestedAt: next.requestedAt,
                updatedAt: next.updatedAt,
              });
              return;
            }

            await sleep(POLL_INTERVAL_MS);
          } catch (error) {
            if (isStale()) {
              return;
            }

            setState({
              status: 'error',
              offerRecords: nextOfferRecords ?? state.offerRecords,
              snapshot: null,
              error:
                error instanceof Error
                  ? error.message
                  : 'No fue posible cargar la oferta académica.',
              requestedAt: lastKnownRequestedAt,
              updatedAt: lastKnownUpdatedAt,
            });
            return;
          }
        }

        if (isStale()) {
          return;
        }

        const recoveredAfterTimeout = await tryDirectSnapshotFallback('polling-timeout');
        if (recoveredAfterTimeout) {
          return;
        }

        setState({
          status: 'error',
          offerRecords: nextOfferRecords ?? state.offerRecords,
          snapshot: null,
          error:
            'La carga de oferta académica tardó demasiado. Intenta nuevamente desde Oferta Académica.',
          requestedAt: lastKnownRequestedAt,
          updatedAt: lastKnownUpdatedAt,
        });
      };

      const promise = run().finally(() => {
        if (inFlightRef.current === promise) {
          inFlightRef.current = null;
        }
      });

      inFlightRef.current = promise;
      await promise;
    },
    [state.offerRecords, state.status],
  );

  useEffect(() => {
    if (authToken && state.status === 'idle') {
      // Proactive background fetch as soon as user logs in Component
      void loadAcademicOffer(authToken, { force: false });
    }
  }, [authToken, state.status, loadAcademicOffer]);

  const value = useMemo(
    () => ({
      state,
      loadAcademicOffer,
      resetAcademicOffer,
    }),
    [state, loadAcademicOffer, resetAcademicOffer],
  );

  return (
    <AcademicOfferContext.Provider value={value}>
      {children}
    </AcademicOfferContext.Provider>
  );
};
