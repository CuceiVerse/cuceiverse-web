import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import {
  Map,
  BookOpen,
  User,
  Settings,
  ChevronDown,
  GraduationCap,
  CalendarDays,
  Trophy,
  FileText,
  Menu,
  X,
} from 'lucide-react';
import { getMyProfile, type AuthUser } from '../features/auth/api/auth';
import { useAcademicOffer } from '../context/useAcademicOffer';
import { ConfirmModal } from './ConfirmModal';
import { resolveAvatarImage } from '../lib/avatarImage';
import { setPerfMark } from '../lib/perfMarks';
import './MainLayout.css';

const CampusAssistantWidget = lazy(() =>
  import('../features/assistant/components/CampusAssistantWidget').then((module) => ({
    default: module.CampusAssistantWidget,
  })),
);

export const MainLayout: React.FC = () => {
  const { logout, isAdmin, token } = useAuth();
  const { resetAcademicOffer } = useAcademicOffer();
  const [profile, setProfile] = useState<AuthUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [navMenuOpen, setNavMenuOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const location = useLocation();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const navDrawerRef = useRef<HTMLDivElement | null>(null);

  const markNavStart = (path: string) => {
    if (location.pathname === path) return;
    setPerfMark(`nav.start:${path}`);
  };

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
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
      if (navDrawerRef.current && !navDrawerRef.current.contains(event.target as Node)) {
        setNavMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', onClickOutside);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, []);

  const avatarImage = useMemo(
    () => resolveAvatarImage(profile?.avatarUrl ?? null, { size: 's' }),
    [profile?.avatarUrl],
  );

  const userLabel = profile?.displayName?.trim() || profile?.siiauCode || 'Usuario';

  useEffect(() => {
    if (!token) {
      resetAcademicOffer();
    }
  }, [token]);

  return (
    <div className="layout-container flex flex-col overflow-hidden bg-slate-950">
      {/* Shared Top Navigation Bar */}
      <nav className="navbar glass-panel flex-none">
        <div className="nav-brand">
          <div className="nav-logo" aria-label="CUCEI">
            <img src="/CUCEI-APP.png" alt="CUCEI App" />
          </div>
          <h2>CUCEIVERSE</h2>
        </div>

        <button
          className="nav-hamburger hidden md:hidden"
          onClick={() => setNavMenuOpen((prev) => !prev)}
          aria-expanded={navMenuOpen}
          aria-label="Toggle navigation menu"
        >
          {navMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>

        <div className="nav-links">
          <NavLink
            to="/home"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            end
            onClick={() => markNavStart('/home')}
          >
            <Map size={18} />
            <span>Mapa</span>
          </NavLink>
          <NavLink
            to="/subjects"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            onClick={() => markNavStart('/subjects')}
          >
            <BookOpen size={18} />
            <span>Oferta Académica</span>
          </NavLink>
          <NavLink
            to="/schedule"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            onClick={() => markNavStart('/schedule')}
          >
            <CalendarDays size={18} />
            <span>Horario</span>
          </NavLink>
          <NavLink
            to="/tramites"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            onClick={() => markNavStart('/tramites')}
          >
            <FileText size={18} />
            <span>Trámites</span>
          </NavLink>
          <NavLink
            to="/profile-hud"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            onClick={() => markNavStart('/profile-hud')}
          >
            <Trophy size={18} />
            <span>Perfil RPG</span>
          </NavLink>
          <NavLink
            to="/avatars"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            onClick={() => markNavStart('/avatars')}
          >
            <User size={18} />
            <span>Habbo Avatar</span>
          </NavLink>
        </div>

        <div className="nav-actions" ref={menuRef}>
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
                    <strong>{profile?.siiauCode ?? 'Sin codigo'}</strong>
                    <span>{profile?.displayName ?? 'Alumno'}</span>
                  </div>
                </div>
              </header>

              <div className="siiau-quick-actions">
                <div className="user-badge glass-panel">
                  <span className="status-dot"></span>
                  En línea
                </div>

                {isAdmin ? (
                  <NavLink
                    to="/admin/mapa"
                    className="siiau-action-button"
                    onClick={() => {
                      markNavStart('/admin/mapa');
                      setMenuOpen(false);
                    }}
                  >
                    <Settings size={16} />
                    <span>Editar mapa</span>
                  </NavLink>
                ) : null}

                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setIsLogoutModalOpen(true);
                  }}
                  className="siiau-action-button danger"
                >
                  <X size={16} />
                  <span>Cerrar sesión</span>
                </button>
              </div>
            </section>
          )}

        </div>
      </nav>

      {/* Mobile Navigation Drawer */}
      {navMenuOpen && (
        <div
          className="nav-drawer-overlay"
          onClick={() => setNavMenuOpen(false)}
        />
      )}
      <div
        className={`nav-drawer glass-panel ${navMenuOpen ? 'open' : ''}`}
        ref={navDrawerRef}
      >
        <NavLink
          to="/home"
          className={({ isActive }) => `drawer-link ${isActive ? 'active' : ''}`}
          end
          onClick={() => {
            markNavStart('/home');
            setNavMenuOpen(false);
          }}
        >
          <Map size={20} />
          <span>Mapa</span>
        </NavLink>
        <NavLink
          to="/subjects"
          className={({ isActive }) => `drawer-link ${isActive ? 'active' : ''}`}
          onClick={() => {
            markNavStart('/subjects');
            setNavMenuOpen(false);
          }}
        >
          <BookOpen size={20} />
          <span>Oferta Académica</span>
        </NavLink>
        <NavLink
          to="/schedule"
          className={({ isActive }) => `drawer-link ${isActive ? 'active' : ''}`}
          onClick={() => {
            markNavStart('/schedule');
            setNavMenuOpen(false);
          }}
        >
          <CalendarDays size={20} />
          <span>Horario</span>
        </NavLink>
        <NavLink
          to="/tramites"
          className={({ isActive }) => `drawer-link ${isActive ? 'active' : ''}`}
          onClick={() => {
            markNavStart('/tramites');
            setNavMenuOpen(false);
          }}
        >
          <FileText size={20} />
          <span>Trámites</span>
        </NavLink>
        <NavLink
          to="/profile-hud"
          className={({ isActive }) => `drawer-link ${isActive ? 'active' : ''}`}
          onClick={() => {
            markNavStart('/profile-hud');
            setNavMenuOpen(false);
          }}
        >
          <Trophy size={20} />
          <span>Perfil RPG</span>
        </NavLink>
        <NavLink
          to="/avatars"
          className={({ isActive }) => `drawer-link ${isActive ? 'active' : ''}`}
          onClick={() => {
            markNavStart('/avatars');
            setNavMenuOpen(false);
          }}
        >
          <User size={20} />
          <span>Habbo Avatar</span>
        </NavLink>
        {isAdmin ? (
          <NavLink
            to="/admin/mapa"
            className={({ isActive }) => `drawer-link ${isActive ? 'active' : ''}`}
            onClick={() => {
              markNavStart('/admin/mapa');
              setNavMenuOpen(false);
            }}
          >
            <Settings size={20} />
            <span>Editor Mapa</span>
          </NavLink>
        ) : null}
      </div>

      {/* Dynamic Content Area */}
      <main className="layout-content flex-1 relative w-full overflow-hidden">
        <Outlet />
      </main>

      {location.pathname !== '/tramites' && location.pathname !== '/map' ? (
        <Suspense fallback={null}>
          <CampusAssistantWidget />
        </Suspense>
      ) : null}

      <ConfirmModal
        isOpen={isLogoutModalOpen}
        title="Cerrar Sesión"
        message="¿Estás seguro de que quieres cerrar sesión?"
        onConfirm={() => {
          setIsLogoutModalOpen(false);
          logout();
        }}
        onCancel={() => setIsLogoutModalOpen(false)}
      />
    </div>
  );
};
