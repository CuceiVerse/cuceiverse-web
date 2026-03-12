import React, { useState, useEffect } from "react";
import type { ReactNode } from "react";

import { AuthContext } from "./AuthContextStore";

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
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
