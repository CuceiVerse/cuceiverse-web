import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import {
  fetchSessionSiiauSnapshot,
  fetchGlobalAcademicOffer,
  type SiiauSnapshot,
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

function transformSnapshotToRecords(snapshot: SiiauSnapshot): AcademicOfferRecord[] {
  const records: AcademicOfferRecord[] = [];

  for (const course of snapshot.courses || []) {
    if (!course.sessions || course.sessions.length === 0) {
      records.push({
        NRC: parseInt(course.nrc || '0', 10),
        Clave: course.clave || '',
        Materia: course.materia || '',
        CR: course.creditos || 0,
        Hora: '',
        Dias: '',
        Edificio: '',
        Aula: '',
        Profesor: course.profesor || '',
      });
    } else {
      for (const session of course.sessions) {
        records.push({
          NRC: parseInt(course.nrc || '0', 10),
          Clave: course.clave || '',
          Materia: course.materia || '',
          CR: course.creditos || 0,
          Hora: session.hora || '',
          Dias: session.dias || '',
          Edificio: session.edif || '',
          Aula: session.aula || '',
          Profesor: session.profesor || course.profesor || '',
        });
      }
    }
  }

  return records;
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
          console.log('[OFFER][WEB] loadAcademicOffer start', {
            runSessionVersion,
            currentSessionVersion: sessionVersionRef.current,
            force,
            token: shortToken(token),
          });
        }

        if (isStale()) {
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.log('[OFFER][WEB] loadAcademicOffer abort stale', {
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
        let reloadInitiated = false;

        // Intenta cargar oferta global de /offer/reload/status
        for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
          try {
            if (import.meta.env.DEV) {
              // eslint-disable-next-line no-console
              console.log('[OFFER][WEB] checking global offer status', {
                attempt,
                runSessionVersion,
                reloadInitiated,
              });
            }

            const offerStatus = await fetchGlobalAcademicOffer(token);

            if (isStale()) {
              return;
            }

            // Si ya hay resultado, usar esos datos
            if (offerStatus.hasResult && offerStatus.materias && offerStatus.materias.length > 0) {
              const now = new Date().toISOString();
              setState({
                status: 'ready',
                offerRecords: nextOfferRecords ?? offerStatus.materias,
                snapshot: null,
                error: null,
                requestedAt: lastKnownRequestedAt ?? now,
                updatedAt: now,
              });
              return;
            }

            // Si está corriendo, esperar
            if (offerStatus.running) {
              await sleep(POLL_INTERVAL_MS);
              continue;
            }

            // Si no hay resultado y no está corriendo, iniciar reload
            if (!offerStatus.hasResult && !reloadInitiated) {
              reloadInitiated = true;
              if (import.meta.env.DEV) {
                // eslint-disable-next-line no-console
                console.log('[OFFER][WEB] initiating offer reload', { attempt });
              }

              const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';
              try {
                await fetch(`${API_BASE}/offer/reload`, {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({}),
                });
              } catch (reloadErr) {
                if (import.meta.env.DEV) {
                  // eslint-disable-next-line no-console
                  console.log('[OFFER][WEB] reload POST failed', {
                    message: reloadErr instanceof Error ? reloadErr.message : 'unknown',
                  });
                }
              }

              await sleep(POLL_INTERVAL_MS);
              continue;
            }

            if (offerStatus.lastError) {
              throw new Error(offerStatus.lastError);
            }

            await sleep(POLL_INTERVAL_MS);
          } catch (error) {
            if (isStale()) {
              return;
            }

            if (import.meta.env.DEV) {
              // eslint-disable-next-line no-console
              console.log('[OFFER][WEB] global offer attempt failed', {
                attempt,
                message: error instanceof Error ? error.message : 'unknown',
              });
            }

            // Continuar intentando
            await sleep(POLL_INTERVAL_MS);
          }
        }

        // Si llega aquí, fallback al snapshot del estudiante
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.log('[OFFER][WEB] global offer polling exhausted, trying student snapshot fallback', {
            runSessionVersion,
          });
        }

        try {
          const snapshotStatus = await fetchSessionSiiauSnapshot(token);
          if (isStale()) return;

          if (snapshotStatus.status === 'ready' && snapshotStatus.snapshot) {
            const transformed = transformSnapshotToRecords(snapshotStatus.snapshot);
            setState({
              status: 'ready',
              offerRecords: nextOfferRecords ?? transformed,
              snapshot: snapshotStatus.snapshot,
              error: null,
              requestedAt: snapshotStatus.requestedAt,
              updatedAt: snapshotStatus.updatedAt,
            });
            return;
          }
        } catch (fallbackErr) {
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.log('[OFFER][WEB] snapshot fallback failed', {
              message: fallbackErr instanceof Error ? fallbackErr.message : 'unknown',
            });
          }
        }

        setState({
          status: 'error',
          offerRecords: nextOfferRecords ?? state.offerRecords,
          snapshot: null,
          error: 'No fue posible cargar la oferta académica. Intenta nuevamente.',
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
