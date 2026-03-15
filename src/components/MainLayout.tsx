import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import {
  LogOut,
  Map,
  BookOpen,
  User,
  Settings,
  ChevronDown,
  GraduationCap,
  CalendarDays,
  Trophy,
} from 'lucide-react';
import { getMyProfile, type AuthUser } from '../features/auth/api/auth';
import { useAcademicOffer } from '../context/useAcademicOffer';
import { CampusAssistantWidget } from '../features/assistant/components/CampusAssistantWidget';
import './MainLayout.css';

function resolveAvatarImage(avatarUrl: string | null): string | null {
  if (!avatarUrl) return null;
  const trimmed = avatarUrl.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/')) {
    return trimmed;
  }

  if (trimmed.includes('.') && trimmed.includes('-')) {
    const params = new URLSearchParams({
      figure: trimmed,
      size: 's',
      direction: '2',
      head_direction: '2',
      action: 'std',
      gesture: 'std',
      img_format: 'png',
    });
    return `/habbo-api/render?${params.toString()}`;
  }

  return null;
}

export const MainLayout: React.FC = () => {
  const { logout, isAdmin, token } = useAuth();
  const { state: offerState, resetAcademicOffer } = useAcademicOffer();
  const [profile, setProfile] = useState<AuthUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!token) {
      setProfile(null);
      return;
    }

    let cancelled = false;

    getMyProfile(token)
      .then((me) => {
        if (!cancelled) {
          setProfile(me);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProfile(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token, resetAcademicOffer]);

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (!menuRef.current) {
        return;
      }
      if (!menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', onClickOutside);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, []);

  const avatarImage = useMemo(
    () => resolveAvatarImage(profile?.avatarUrl ?? null),
    [profile?.avatarUrl],
  );

  const userLabel = profile?.displayName?.trim() || profile?.siiauCode || 'Usuario';

  useEffect(() => {
    if (!token) {
      resetAcademicOffer();
    }
  }, [token]);

  return (
    <div className="layout-container h-screen w-screen flex flex-col overflow-hidden bg-slate-950">
      {/* Shared Top Navigation Bar */}
      <nav className="navbar glass-panel flex-none">
        <div className="nav-brand">
          <div className="nav-logo"></div>
          <h2>CuceiVerse</h2>
        </div>
        
        <div className="nav-links">
          <NavLink 
            to="/" 
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            end
          >
            <Map size={18} />
            <span>Mapa</span>
          </NavLink>
          <NavLink 
            to="/subjects" 
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <BookOpen size={18} />
            <span>Oferta Académica</span>
          </NavLink>
          <NavLink
            to="/schedule"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <CalendarDays size={18} />
            <span>Horario</span>
          </NavLink>
          <NavLink
            to="/profile-hud"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <Trophy size={18} />
            <span>Perfil RPG</span>
          </NavLink>
          <NavLink 
            to="/avatars" 
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <User size={18} />
            <span>Habbo Avatar</span>
          </NavLink>
          {isAdmin ? (
            <NavLink
              to="/admin/mapa"
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              <Settings size={18} />
              <span>Editor Mapa</span>
            </NavLink>
          ) : null}
        </div>

        <div className="nav-actions" ref={menuRef}>
          <div className="user-badge glass-panel">
            <span className="status-dot"></span>
            En línea
          </div>

          <button
            className={`user-avatar-trigger ${menuOpen ? 'open' : ''}`}
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-expanded={menuOpen}
            aria-haspopup="dialog"
          >
            <span className="nav-avatar-circle">
              {avatarImage ? (
                <img src={avatarImage} alt={`Avatar de ${userLabel}`} />
              ) : (
                <span className="avatar-fallback">{userLabel.slice(0, 1).toUpperCase()}</span>
              )}
            </span>
            <ChevronDown size={16} className="avatar-trigger-chevron" />
          </button>

          {menuOpen && (
            <section className="siiau-user-menu glass-panel" role="dialog" aria-label="Menu de usuario y SIIAU">
              <header className="siiau-menu-header">
                <div className="siiau-user-title">
                  <GraduationCap size={18} />
                  <div>
                    <strong>{userLabel}</strong>
                    <span>{profile?.siiauCode ?? 'Sin codigo'}</span>
                  </div>
                </div>
              </header>

              <div className="siiau-menu-body">
                {offerState.status === 'loading' && (
                  <div className="siiau-loading-screen animate-fade-in">
                    <div className="loading-content">
                      <div className="av-spinner-ring">
                        <div className="inner-ring"></div>
                      </div>
                      <h2>Sincronizando</h2>
                      <p>Consultando informacion academica en SIIAU...</p>
                      <div className="loading-bar">
                        <div className="loading-bar-fill"></div>
                      </div>
                    </div>
                  </div>
                )}

                {offerState.status === 'idle' && (
                  <p className="siiau-error">
                    La oferta academica aun no fue cargada. Abre Oferta Academica para sincronizar.
                  </p>
                )}

                {offerState.status === 'error' && offerState.error && (
                  <p className="siiau-error">{offerState.error}</p>
                )}

                {offerState.snapshot && (
                  <div className="siiau-data-block">
                    <div className="siiau-stats">
                      <span>Total materias: {offerState.snapshot.stats.total_courses}</span>
                      <span>Con horario: {offerState.snapshot.stats.with_schedule}</span>
                    </div>
                    <div className="siiau-courses-list">
                      {offerState.snapshot.courses.slice(0, 10).map((course) => (
                        <article key={`${course.nrc}-${course.clave}`}>
                          <strong>{course.materia}</strong>
                          <span>{course.clave} • NRC {course.nrc}</span>
                          <span>{course.profesor || 'Profesor por definir'}</span>
                        </article>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          <button onClick={logout} className="logout-btn">
            <LogOut size={18} />
            <span>Salir</span>
          </button>
        </div>
      </nav>

      {/* Dynamic Content Area */}
      <main className="layout-content flex-1 relative w-full overflow-hidden">
        <Outlet />
      </main>

      <CampusAssistantWidget />
    </div>
  );
};
