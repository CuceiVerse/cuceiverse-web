import React, { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { AuthContext } from "./AuthContextStore";

const SESSION_IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const SESSION_NOTICE_STORAGE_KEY = 'cuceiverse_session_notice';
const SESSION_LAST_ACTIVITY_STORAGE_KEY = 'cuceiverse_session_last_activity';
const SESSION_EXPIRED_NOTICE = 'Tu sesión ha caducado por inactividad. Vuelve a iniciar sesión.';
const SESSION_ACTIVITY_EVENTS = [
  'mousedown',
  'mousemove',
  'keydown',
  'scroll',
  'touchstart',
  'pointerdown',
  'focus',
] as const;

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
  const [sessionNotice, setSessionNotice] = useState<string | null>(
    sessionStorage.getItem(SESSION_NOTICE_STORAGE_KEY),
  );
  const idleTimeoutRef = useRef<number | null>(null);
  const lastActivityRef = useRef<number>(
    Number(sessionStorage.getItem(SESSION_LAST_ACTIVITY_STORAGE_KEY) ?? 0) || Date.now(),
  );

  const clearIdleTimer = () => {
    if (idleTimeoutRef.current !== null) {
      window.clearTimeout(idleTimeoutRef.current);
      idleTimeoutRef.current = null;
    }
  };

  const persistLastActivity = (timestamp: number) => {
    lastActivityRef.current = timestamp;
    sessionStorage.setItem(SESSION_LAST_ACTIVITY_STORAGE_KEY, String(timestamp));
  };

  const setExpiredNotice = () => {
    setSessionNotice(SESSION_EXPIRED_NOTICE);
    sessionStorage.setItem(SESSION_NOTICE_STORAGE_KEY, SESSION_EXPIRED_NOTICE);
  };

  const clearSessionNotice = () => {
    setSessionNotice(null);
    sessionStorage.removeItem(SESSION_NOTICE_STORAGE_KEY);
  };

  const expireSession = () => {
    clearIdleTimer();
    setExpiredNotice();
    sessionStorage.removeItem(SESSION_LAST_ACTIVITY_STORAGE_KEY);
    setToken(null);
  };

  const scheduleIdleLogout = () => {
    clearIdleTimer();
    const elapsed = Date.now() - lastActivityRef.current;
    if (elapsed >= SESSION_IDLE_TIMEOUT_MS) {
      expireSession();
      return;
    }

    idleTimeoutRef.current = window.setTimeout(() => {
      expireSession();
    }, SESSION_IDLE_TIMEOUT_MS - elapsed);
  };

  const registerActivity = () => {
    if (!token) return;

    const now = Date.now();
    const elapsed = now - lastActivityRef.current;
    if (elapsed >= SESSION_IDLE_TIMEOUT_MS) {
      expireSession();
      return;
    }

    persistLastActivity(now);
    scheduleIdleLogout();
  };

  useEffect(() => {
    if (token) {
      localStorage.setItem("cuceiverse_token", token);
    } else {
      localStorage.removeItem("cuceiverse_token");
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      clearIdleTimer();
      sessionStorage.removeItem(SESSION_LAST_ACTIVITY_STORAGE_KEY);
      return;
    }

    const storedLastActivity = Number(
      sessionStorage.getItem(SESSION_LAST_ACTIVITY_STORAGE_KEY) ?? 0,
    );
    const lastActivity = Number.isFinite(storedLastActivity) && storedLastActivity > 0
      ? storedLastActivity
      : Date.now();

    persistLastActivity(lastActivity);

    if (Date.now() - lastActivity >= SESSION_IDLE_TIMEOUT_MS) {
      expireSession();
      return;
    }

    scheduleIdleLogout();

    const onActivity = (event: Event) => {
      if (event.type === 'visibilitychange' && document.visibilityState !== 'visible') {
        return;
      }
      registerActivity();
    };

    SESSION_ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, onActivity, { passive: true });
    });
    document.addEventListener('visibilitychange', onActivity);

    return () => {
      clearIdleTimer();
      SESSION_ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, onActivity);
      });
      document.removeEventListener('visibilitychange', onActivity);
    };
  }, [token]);

  const login = (newToken: string) => {
    clearSessionNotice();
    persistLastActivity(Date.now());
    setToken(newToken);
  };

  const logout = (reason: 'manual' | 'expired' = 'manual') => {
    clearIdleTimer();
    if (reason === 'expired') {
      setExpiredNotice();
    } else {
      clearSessionNotice();
    }
    sessionStorage.removeItem(SESSION_LAST_ACTIVITY_STORAGE_KEY);
    setToken(null);
  };

  const value = {
    token,
    isAuthenticated: !!token,
    isAdmin: decodeIsAdmin(token),
    sessionNotice,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
