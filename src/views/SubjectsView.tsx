import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { Search, Book, Clock, UserSquare, MapPin, ChevronLeft, ChevronRight, Hash, Building2, Calendar, X, Laptop, Users, MonitorSmartphone, RefreshCw } from 'lucide-react';
import mockData from '../data/mockSubjects.json';
import { useAuth } from '../context/useAuth';
import { useAcademicOffer } from '../context/useAcademicOffer';
import type { AcademicOfferRecord } from '../context/AcademicOfferContextStore';
import './SubjectsView.css';

interface Subject {
  NRC: number;
  Clave: string;
  Materia: string;
  CR: number;
  Hora: string | number;
  Dias: string;
  Edificio: string | number;
  Aula: string | number;
  Profesor: string;
}

const ITEMS_PER_PAGE = 30;

// Normalizes a string: lowercase + remove diacritics (accents)
const normalize = (str: string) =>
  str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const getModalidad = (edificio: string | number | null | undefined) => {
  const ed = String(edificio || '').toUpperCase();
  
  if (!ed || ed === 'N/A' || ed === 'UNDEFINED') {
    return { text: 'Por Definir', icon: <Users size={14} />, class: 'mod-unknown' };
  }

  // Si tiene DESV y ademas tiene otro edificio diferente concatenado (mas de 6 chars usualmente)
  // Nota: DESV1 tiene 5 letras. Si es "DESV1, ALFA" tiene mucho mas.
  if (ed.includes('DESV')) {
    if (ed.length > 7) {
      return { text: 'Híbrida', icon: <MonitorSmartphone size={14} />, class: 'mod-hybrid' };
    }
    return { text: 'Virtual', icon: <Laptop size={14} />, class: 'mod-virtual' };
  }

  return { text: 'Presencial', icon: <Users size={14} />, class: 'mod-presencial' };
};

const formatDays = (diasStr: string | number | null | undefined) => {
  if (!diasStr) return 'N/A';
  const str = String(diasStr).toUpperCase();
  
  const map: Record<string, string> = {
    'L': 'Lunes',
    'M': 'Martes',
    'I': 'Miércoles',
    'J': 'Jueves',
    'V': 'Viernes',
    'S': 'Sábado'
  };

  const daysFound = str.split('').filter(char => map[char]);
  
  if (daysFound.length === 0) return 'N/A';
  
  return daysFound.map(char => map[char]).join(', ');
};

export const SubjectsView: React.FC = () => {
  const { token } = useAuth();
  const { state: offerState, loadAcademicOffer } = useAcademicOffer();
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [reloading, setReloading] = useState(false);
  const [reloadError, setReloadError] = useState<string | null>(null);
  const [reloadSuccess, setReloadSuccess] = useState(false);
  
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const q = searchParams.get('q') || searchParams.get('edificio');
    if (q) {
      setSearchTerm(decodeURIComponent(q));
      setCurrentPage(1);
    }
  }, [searchParams]);

  const handleReload = useCallback(async () => {
    if (!token || reloading) return;
    setReloading(true);
    setReloadError(null);
    setReloadSuccess(false);

    const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

    try {
      // 1. Iniciar la tarea en segundo plano
      const initRes = await fetch(`${API_BASE}/offer/reload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      if (!initRes.ok) {
        const errData = await initRes.json().catch(() => ({})) as { message?: string };
        throw new Error(errData.message ?? `Error ${initRes.status}`);
      }

      // 2. Polling: esperar a que termine
      let finished = false;
      let lastResult: any = null;

      while (!finished) {
        await new Promise(r => setTimeout(r, 3000));
        
        const statusRes = await fetch(`${API_BASE}/offer/reload/status`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!statusRes.ok) throw new Error('Se perdió la conexión con el servidor de horarios.');
        
        const statusData = await statusRes.json();
        
        if (statusData.lastError) {
          throw new Error(statusData.lastError);
        }

        if (!statusData.running && statusData.hasResult) {
          finished = true;
          lastResult = statusData.materias;
        }

        // Si por alguna razón deja de correr sin resultado
        if (!statusData.running && !statusData.hasResult) {
          finished = true;
        }
      }

      // 3. Procesar resultados
      if (lastResult && lastResult.length > 0) {
        void loadAcademicOffer(token, { force: true, offerRecords: lastResult });
        setReloadSuccess(true);
        setTimeout(() => setReloadSuccess(false), 5000);
      } else {
        throw new Error('El scraping terminó sin encontrar materias.');
      }
    } catch (err) {
      setReloadError(err instanceof Error ? err.message : 'No se pudo completar el scraping.');
    } finally {
      setReloading(false);
    }
  }, [token, reloading, loadAcademicOffer]);

  useEffect(() => {
    if (!token) return;
    if (offerState.offerRecords.length > 0 && offerState.status === 'ready') return;
    if (offerState.status === 'loading') return;
    void loadAcademicOffer(token, {
      offerRecords: mockData as AcademicOfferRecord[],
    });
  }, [token, offerState.offerRecords.length, offerState.status, loadAcademicOffer]);

  const sourceSubjects = useMemo(() => {
    if (offerState.offerRecords.length > 0) {
      return offerState.offerRecords as Subject[];
    }
    return mockData as Subject[];
  }, [offerState.offerRecords]);

  const filteredSubjects = useMemo(() => {
    const q = normalize(searchTerm.trim());
    if (!q) return sourceSubjects;
    
    return sourceSubjects.filter((subject) => {
      const modText = normalize(getModalidad(subject.Edificio).text);

      return (
        normalize(String(subject.Materia || '')).includes(q) ||
        normalize(String(subject.Clave || '')).includes(q) ||
        normalize(String(subject.Profesor || '')).includes(q) ||
        String(subject.NRC || '').includes(q) ||
        normalize(String(subject.Edificio || '')).includes(q) ||
        modText.includes(q)
      );
    });
  }, [searchTerm, sourceSubjects]);

  const totalPages = Math.ceil(filteredSubjects.length / ITEMS_PER_PAGE);

  const currentSubjects = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredSubjects.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredSubjects, currentPage]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  const canShowSubjects = sourceSubjects.length > 0;

  return (
    <>
      <div className="subjects-scroll-area">
        <div className="subjects-container animate-fade-in">
      <div className="subjects-header">
        <div className="header-title">
          <div className="icon-wrapper">
            <Book size={28} />
          </div>
          <div>
            <h1>Oferta Académica</h1>
            <p>Explorando {sourceSubjects.length.toLocaleString()} materias disponibles en CUCEI.</p>
          </div>
        </div>

        <div className="search-wrapper glass-panel">
          <Search size={20} className="search-icon" />
          <input
            type="text"
            placeholder="Buscar por materia, profesor, NRC, virtual, presencial..."
            value={searchTerm}
            onChange={handleSearchChange}
          />
        </div>

        <div className="reload-controls">
          <button
            className={`reload-btn glass-panel${reloading ? ' reloading' : ''}${reloadSuccess ? ' success' : ''}`}
            onClick={() => void handleReload()}
            disabled={reloading}
            title="Vuelve a descargar la oferta académica más reciente de SIIAU"
          >
            <RefreshCw size={16} className={reloading ? 'spin-icon' : ''} />
            <span>{reloading ? 'Cargando...' : reloadSuccess ? '¡Actualizado!' : 'Volver a cargar'}</span>
          </button>
          {reloadError && (
            <span className="reload-error">
              ⚠️ {reloadError}
            </span>
          )}
        </div>
      </div>

      <div className="subjects-grid">
        {canShowSubjects && currentSubjects.length > 0 ? (
          currentSubjects.map((subject, index) => {
            const modalidad = getModalidad(subject.Edificio);
            
            return (
              <div key={`${subject.NRC}-${index}`} className="subject-card glass-panel">
                <div className="card-header">
                  <span className="subject-nrc">NRC: {subject.NRC}</span>
                  <div className="header-badges">
                    <span className={`modality-badge ${modalidad.class}`} title={modalidad.text}>
                      {modalidad.icon}
                      <span className="modality-text">{modalidad.text}</span>
                    </span>
                    <span className="subject-cr">{subject.CR || 0} CR</span>
                  </div>
                </div>
                
                <h3 className="subject-title">{subject.Materia || 'Sin Nombre'}</h3>
                <div className="subject-clave">{subject.Clave || 'S/C'}</div>
                
                <div className="subject-details preview-details">
                  <div className="detail-row">
                    <UserSquare size={16} className="detail-icon" />
                    <span className="truncate">{subject.Profesor || 'Sin Profesor Asignado'}</span>
                  </div>
                  <div className="detail-row">
                    <Clock size={16} className="detail-icon" />
                    <span>{subject.Hora || 'Sin Horario'} | {formatDays(subject.Dias)}</span>
                  </div>
                </div>
                
                <button 
                  className="enroll-btn"
                  onClick={() => setSelectedSubject(subject)}
                >
                  Ver Detalles
                </button>
              </div>
            );
          })
        ) : (
          <div className="no-results glass-panel">
            <Book size={48} className="muted-icon" />
            <h3>No se encontraron materias</h3>
            <p>Intenta ajustar tu búsqueda.</p>
          </div>
        )}
      </div>

          {canShowSubjects && totalPages > 1 && (
            <div className="pagination-controls">
          <button 
            className="pagination-btn glass-panel"
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
          >
            <ChevronLeft size={20} />
            Anterior
          </button>
          
          <div className="pagination-info glass-panel">
            Página {currentPage} de {totalPages}
            <span className="pagination-total">({filteredSubjects.length} resultados)</span>
          </div>

          <button 
            className="pagination-btn glass-panel"
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
          >
            Siguiente
            <ChevronRight size={20} />
          </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal View for Subject Details */}
      {selectedSubject && createPortal(
        <div className="modal-overlay animate-fade-in" onClick={() => setSelectedSubject(null)}>
          <div className="modal-content subjects-modal glass-panel animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedSubject(null)}>
              <X size={24} />
            </button>
            
            <div className="modal-header">
              <span className="subject-nrc">NRC: {selectedSubject.NRC}</span>
              <div className="header-badges">
                {(() => {
                  const mod = getModalidad(selectedSubject.Edificio);
                  return (
                    <span className={`modality-badge ${mod.class}`}>
                      {mod.icon}
                      <span className="modality-text">{mod.text}</span>
                    </span>
                  );
                })()}
                <span className="subject-cr">{selectedSubject.CR || 0} Créditos</span>
              </div>
            </div>
            
            <h2 className="modal-title">{selectedSubject.Materia || 'Sin Nombre'}</h2>
            
            <div className="modal-details-grid">
              <div className="detail-item">
                <UserSquare size={18} className="detail-icon" />
                <div>
                  <span className="detail-label">Profesor</span>
                  <span className="detail-value">{selectedSubject.Profesor || 'Sin Asignar'}</span>
                </div>
              </div>
              
              <div className="detail-item">
                <Clock size={18} className="detail-icon" />
                <div>
                  <span className="detail-label">Horario</span>
                  <span className="detail-value">{selectedSubject.Hora || 'N/A'}</span>
                </div>
              </div>
              
              <div className="detail-item">
                <Calendar size={18} className="detail-icon" />
                <div>
                  <span className="detail-label">Días</span>
                  <span className="detail-value">{formatDays(selectedSubject.Dias)}</span>
                </div>
              </div>

              <div className="detail-item">
                <Building2 size={18} className="detail-icon" />
                <div>
                  <span className="detail-label">Edificio</span>
                  <span className="detail-value">{selectedSubject.Edificio || 'No Asignado'}</span>
                </div>
              </div>

              <div className="detail-item">
                <MapPin size={18} className="detail-icon" />
                <div>
                  <span className="detail-label">Aula</span>
                  <span className="detail-value">{selectedSubject.Aula || 'N/A'}</span>
                </div>
              </div>

              <div className="detail-item">
                <Hash size={18} className="detail-icon" />
                <div>
                  <span className="detail-label">Clave Institucional</span>
                  <span className="detail-value">{selectedSubject.Clave}</span>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
