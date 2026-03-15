import { createContext } from 'react';
import type { SiiauSnapshot } from '../features/siiau/api/siiau';

export type AcademicOfferStatus = 'idle' | 'loading' | 'ready' | 'error';

export type AcademicOfferRecord = {
  NRC: number;
  Clave: string;
  Materia: string;
  CR: number;
  Hora: string | number;
  Dias: string;
  Edificio: string | number;
  Aula: string | number;
  Profesor: string;
};

export type AcademicOfferState = {
  status: AcademicOfferStatus;
  offerRecords: AcademicOfferRecord[];
  snapshot: SiiauSnapshot | null;
  error: string | null;
  requestedAt: string | null;
  updatedAt: string | null;
};

export type AcademicOfferContextType = {
  state: AcademicOfferState;
  loadAcademicOffer: (
    token: string,
    options?: { force?: boolean; offerRecords?: AcademicOfferRecord[] },
  ) => Promise<void>;
  resetAcademicOffer: () => void;
};

export const ACADEMIC_OFFER_IDLE_STATE: AcademicOfferState = {
  status: 'idle',
  offerRecords: [],
  snapshot: null,
  error: null,
  requestedAt: null,
  updatedAt: null,
};

export const AcademicOfferContext = createContext<AcademicOfferContextType | undefined>(
  undefined,
);
