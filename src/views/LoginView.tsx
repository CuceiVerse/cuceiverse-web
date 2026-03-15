import React, { useState } from "react";
import { useAuth } from "../context/useAuth";
import { LogIn, User, Lock, ArrowRight, Loader2 } from "lucide-react";
import { ParticlesBackground } from "../components/ParticlesBackground";
import { loginWithCodigoNip } from "../features/auth/api/auth";
import "./LoginView.css";

export const LoginView: React.FC = () => {
  const { login } = useAuth();
  const [codigo, setCodigo] = useState("");
  const [nip, setNip] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const doLogin = async (nextCodigo: string, nextNip: string) => {
    setError("");
    setIsLoading(true);

    try {
      if (!nextCodigo.trim() || !nextNip.trim()) {
        setError("Por favor, ingresa tus credenciales.");
        return;
      }

      const response = await loginWithCodigoNip(nextCodigo.trim(), nextNip.trim());
      login(response.accessToken);
    } catch (err: unknown) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : "Credenciales inválidas. Inténtalo de nuevo.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await doLogin(codigo, nip);
  };

  const handleAdminTestAccess = async () => {
    const adminCodigo = "admin";
    const adminNip = "admin123";
    setCodigo(adminCodigo);
    setNip(adminNip);
    await doLogin(adminCodigo, adminNip);
  };

  return (
    <div className="login-container">
      <ParticlesBackground />

      <div className="login-content animate-fade-in">
        <div className="login-header">
          <div className="logo-container">
            <LogIn size={32} className="logo-icon" />
          </div>
          <h1>CuceiVerse</h1>
          <p>Bienvenido al Metaverso Estudiantil</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form glass-panel">
          {error && <div className="error-message">{error}</div>}

          <div className="input-group">
            <label htmlFor="codigo">Codigo</label>
            <div className="input-wrapper">
              <User size={18} className="input-icon" />
              <input
                id="codigo"
                type="text"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="Ej. 123456789"
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="input-group">
            <label htmlFor="nip">NIP</label>
            <div className="input-wrapper">
              <Lock size={18} className="input-icon" />
              <input
                id="nip"
                type="password"
                value={nip}
                onChange={(e) => setNip(e.target.value)}
                placeholder="••••••••"
                disabled={isLoading}
              />
            </div>
          </div>

          <button
            type="submit"
            className={`submit-btn ${isLoading ? "loading" : ""}`}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 size={20} className="spinner" />
            ) : (
              <>
                <span>Iniciar Sesión</span>
                <ArrowRight size={18} />
              </>
            )}
          </button>

          <button
            type="button"
            className="admin-test-btn"
            disabled={isLoading}
            onClick={() => void handleAdminTestAccess()}
          >
            Acceso Admin (Pruebas)
          </button>
        </form>

        <div className="login-footer">
          <p>Proyecto Modular • CUCEI</p>
        </div>
      </div>
    </div>
  );
};
