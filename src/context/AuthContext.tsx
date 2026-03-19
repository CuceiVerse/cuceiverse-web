import React, { useState, useEffect } from "react";
import type { ReactNode } from "react";

import { AuthContext } from "./AuthContextStore";

/** Decodifica el campo isAdmin del payload JWT (sin verificar firma). */
function decodeIsAdmin(token: string | null): boolean {
  if (!token) return false;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const raw = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(raw)) as Record<string, unknown>;
    return json["isAdmin"] === true;
  } catch {
    return false;
  }
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [token, setToken] = useState<string | null>(
    localStorage.getItem("cuceiverse_token"),
  );

  useEffect(() => {
    if (token) {
      localStorage.setItem("cuceiverse_token", token);
    } else {
      localStorage.removeItem("cuceiverse_token");
    }
  }, [token]);

  const login = (newToken: string) => {
    setToken(newToken);
  };

  const logout = () => {
    setToken(null);
  };

  const value = {
    token,
    isAuthenticated: !!token,
    isAdmin: decodeIsAdmin(token),
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
