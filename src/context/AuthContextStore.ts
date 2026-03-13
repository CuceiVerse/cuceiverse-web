import { createContext } from "react";

export interface AuthContextType {
  token: string | null;
  isAuthenticated: boolean;
  /** Decodificado del payload JWT — sólo para mostrar/ocultar UI, no para seguridad. */
  isAdmin: boolean;
  login: (token: string) => void;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(
  undefined,
);
