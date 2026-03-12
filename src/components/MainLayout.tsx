import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { LogOut, Map, BookOpen, User } from 'lucide-react';
import './MainLayout.css';

export const MainLayout: React.FC = () => {
  const { logout } = useAuth();

  return (
    <div className="layout-container">
      {/* Shared Top Navigation Bar */}
      <nav className="navbar glass-panel">
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
      <main className="layout-content">
        <Outlet />
      </main>
    </div>
  );
};
