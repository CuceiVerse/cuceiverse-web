import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { LogOut, Map, BookOpen, User, Settings } from 'lucide-react';
import './MainLayout.css';

export const MainLayout: React.FC = () => {
  const { logout, isAdmin } = useAuth();

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

        <div className="nav-actions">
          <div className="user-badge glass-panel">
            <span className="status-dot"></span>
            En línea
          </div>
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
    </div>
  );
};
