import React from 'react';
import { 
  ClipboardCheck, 
  Clock, 
} from 'lucide-react';
import './HomeView.css';

export const TramitesView: React.FC = () => {
  return (
    <div className="tramites-container w-full min-h-full h-full bg-slate-950 flex flex-col items-center animate-fade-in overflow-y-auto pt-16 pb-20 px-4">
      <div className="w-full max-w-4xl flex flex-col items-center text-center">
        {/* Header Section */}
        <header className="mb-16 w-full flex flex-col items-center">
          <div className="flex items-center gap-3 mb-6 justify-center">
            <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
              <ClipboardCheck className="text-cyan-400" size={24} />
            </div>
            <span className="text-xs font-bold tracking-[0.2em] text-cyan-500/80 uppercase">Servicios</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-white mb-6 tracking-tight leading-tight">
            Guía de Trámites Universitarios
          </h1>
          <p className="text-slate-400 max-w-2xl text-lg md:text-xl leading-relaxed">
            Consulta los requisitos y pasos para realizar tus gestiones académicas y administrativas dentro del plantel.
          </p>
        </header>

        {/* Grid Section - Simplified Generic Boxes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full">
          {[1, 2, 3, 4].map((i) => (
            <div 
              key={i}
              className="group relative overflow-hidden rounded-[2rem] border border-slate-800/50 bg-slate-900/20 p-12 transition-all hover:bg-slate-900/30 flex flex-col items-center justify-center min-h-[200px]"
            >
              <div className="flex flex-col items-center gap-5 text-slate-500/50 transition-colors group-hover:text-cyan-500/40">
                <Clock size={40} className="opacity-20" />
                <span className="text-xl md:text-2xl font-black tracking-[0.2em] uppercase opacity-40">
                  Próximamente
                </span>
              </div>
              
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          ))}
        </div>

        {/* Simplified Footer Decoration */}
        <div className="mt-24 w-full flex flex-col items-center">
          <div className="w-24 h-1 px-1 rounded-full bg-slate-800/50"></div>
        </div>
      </div>
    </div>
  );
};
