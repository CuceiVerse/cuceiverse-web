import { createContext } from "react";

export interface AuthContextType {
  token: string | null;
  isAuthenticated: boolean;
  /** Decodificado del payload JWT — sólo para mostrar/ocultar UI, no para seguridad. */
  isAdmin: boolean;
  sessionNotice: string | null;
  login: (token: string) => void;
  logout: (reason?: 'manual' | 'expired') => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(
  undefined,
);
