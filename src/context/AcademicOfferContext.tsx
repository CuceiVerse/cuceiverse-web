import React, { useCallback, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { fetchSessionSiiauSnapshot } from '../features/siiau/api/siiau';
import {
  ACADEMIC_OFFER_IDLE_STATE,
  AcademicOfferContext,
  type AcademicOfferRecord,
  type AcademicOfferState,
} from './AcademicOfferContextStore';

const POLL_INTERVAL_MS = 1500;
const MAX_POLL_ATTEMPTS = 30;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export const AcademicOfferProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [state, setState] = useState<AcademicOfferState>(ACADEMIC_OFFER_IDLE_STATE);
  const inFlightRef = useRef<Promise<void> | null>(null);

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
        setState((prev) => ({
          ...prev,
          status: 'loading',
          error: null,
        }));

        let lastKnownRequestedAt: string | null = null;
        let lastKnownUpdatedAt: string | null = null;

        for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
          try {
            const next = await fetchSessionSiiauSnapshot(token);
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
