import React, { useState } from "react";
import { useAuth } from "../context/useAuth";
import { LogIn, User, Lock, ArrowRight, Loader2 } from "lucide-react";
import { ParticlesBackground } from "../components/ParticlesBackground";
import "./LoginView.css";

export const LoginView: React.FC = () => {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      // Temporary MVP Mock: Replace with real axios call to NestJS
      // const response = await axios.post('http://localhost:3000/auth/login', { email, password });
      // login(response.data.access_token);

      // Simulating network delay
      await new Promise((resolve) => setTimeout(resolve, 800));

      if (email && password) {
        // Mock token for now until we connect the real backend
        login("mock_jwt_token_for_testing");
      } else {
        setError("Por favor, ingresa tus credenciales.");
      }
    } catch (err: unknown) {
      console.error(err);
      setError("Credenciales inválidas. Inténtalo de nuevo.");
    } finally {
      setIsLoading(false);
    }
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
            <label htmlFor="email">Correo Electrónico</label>
            <div className="input-wrapper">
              <User size={18} className="input-icon" />
              <input
                id="email"
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="alumno@alumnos.udg.mx"
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="input-group">
            <label htmlFor="password">Contraseña</label>
            <div className="input-wrapper">
              <Lock size={18} className="input-icon" />
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
        </form>

        <div className="login-footer">
          <p>Proyecto Modular • CUCEI</p>
        </div>
      </div>
    </div>
  );
};
