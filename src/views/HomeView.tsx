import React from 'react';
import { Map } from 'lucide-react';
import './HomeView.css';

export const HomeView: React.FC = () => {
  return (
    <div className="home-container">
      {/* Main Content Area */}
      <main className="main-content">
        <div className="placeholder-map glass-panel animate-fade-in">
          <div className="map-icon-container">
            <Map size={48} className="map-icon" />
          </div>
          <h3>Mapa 3D en Construcción</h3>
          <p>
            Aquí es donde integraremos el mapa interactivo de CUCEI.
            Pronto podrás ver tu avatar estilo Habbo caminando por este espacio.
          </p>
          <div className="pulse-ring"></div>
        </div>
      </main>
    </div>
  );
};
