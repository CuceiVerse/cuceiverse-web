import React, { useEffect, useMemo } from 'react';
import { AlertCircle, Sparkles, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';

import { AcademicProfileHUD } from '../components/AcademicProfileHUD';
import { useAuth } from '../context/useAuth';
import { useAcademicOffer } from '../context/useAcademicOffer';
import mockData from '../data/mockSubjects.json';
import type { AcademicOfferRecord } from '../context/AcademicOfferContextStore';

import './AcademicProfileView.css';

export const AcademicProfileView: React.FC = () => {
  const { token } = useAuth();
  const { state: offerState, loadAcademicOffer } = useAcademicOffer();

  useEffect(() => {
    if (!token) return;
    if (offerState.status === 'loading') return;
    if (offerState.status === 'ready' && offerState.snapshot?.profile) return;

    void loadAcademicOffer(token, {
      force: offerState.status === 'ready' && !offerState.snapshot?.profile,
      offerRecords: mockData as AcademicOfferRecord[],
    });
  }, [token, offerState.status, offerState.snapshot, loadAcademicOffer]);

  const studentNrcSet = useMemo(() => {
    const set = new Set<string>();
    for (const course of offerState.snapshot?.courses ?? []) {
      const nrc = String(course.nrc ?? '').trim();
      if (nrc) set.add(nrc);
    }
    return set;
  }, [offerState.snapshot?.courses]);

  const matchedOfferRecords = useMemo(() => {
    return offerState.offerRecords.filter((record) =>
      studentNrcSet.has(String(record.NRC ?? '').trim()),
    );
  }, [offerState.offerRecords, studentNrcSet]);

  const creditsEarned = useMemo(
    () => matchedOfferRecords.reduce((acc, curr) => acc + Number(curr.CR || 0), 0),
    [matchedOfferRecords],
  );

  const creditsTotal = useMemo(
    () =>
      (offerState.snapshot?.courses ?? []).reduce(
        (acc, curr) => acc + Number(curr.creditos ?? 0),
        0,
      ),
    [offerState.snapshot?.courses],
  );

  const semesterClasses = useMemo(() => {
    const classes = offerState.snapshot?.courses ?? [];
    const unique = new Map<string, { id: string; name: string; xpReward: number }>();

    for (const course of classes) {
      const nrc = String(course.nrc ?? '').trim();
      const key = nrc || `${String(course.clave ?? '').trim()}-${String(course.materia ?? '').trim()}`;
      if (!key || unique.has(key)) continue;

      unique.set(key, {
        id: key,
        name: course.materia?.trim() || `Materia ${course.clave ?? key}`,
        xpReward: Number(course.creditos ?? 0),
      });
    }

    return Array.from(unique.values());
  }, [offerState.snapshot?.courses]);

  const profile = offerState.snapshot?.profile;

  const careerName =
    profile?.careerName?.trim() ||
    offerState.snapshot?.carrera_value?.trim() ||
    offerState.snapshot?.majrp ||
    'Trayectoria academica';

  const hasProfileCredits =
    typeof profile?.creditsEarned === 'number' &&
    typeof profile?.creditsTotal === 'number' &&
    profile.creditsTotal > 0;

  const hudCreditsEarned = hasProfileCredits
    ? Number(profile?.creditsEarned ?? 0)
    : null;
  const hudCreditsTotal = hasProfileCredits
    ? Number(profile?.creditsTotal ?? 0)
    : null;
  const hudCreditsMissingInfo =
    hasProfileCredits && hudCreditsEarned != null && hudCreditsTotal != null
      ? `Mas info: faltantes = requeridos (${hudCreditsTotal}) - adquiridos (${hudCreditsEarned}) = ${Math.max(hudCreditsTotal - hudCreditsEarned, 0)}. Fuente: Kardex SIIAU.`
      : undefined;
  const hudCompletedClasses = useMemo(
    () =>
      (profile?.completedClasses ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        grade: item.grade ?? null,
        description:
          item.description ??
          `Detalle de la materia ${item.name}. Fuente: Kardex SIIAU.`,
      })),
    [profile?.completedClasses],
  );
  const hudPendingClasses = semesterClasses;
  const hudAverage = profile?.average ?? offerState.snapshot?.average ?? null;

  const isReady = offerState.status === 'ready' && !!offerState.snapshot;

  const handleManualSync = () => {
    if (!token) return;
    void loadAcademicOffer(token, {
      force: true,
      offerRecords: mockData as AcademicOfferRecord[],
    });
  };

  return (
    <div className="academic-profile-scroll-area">
      <section className="academic-profile-container animate-fade-in">
        <header className="academic-profile-header glass-panel">
          <div className="title-wrap">
            <Sparkles size={20} />
            <div>
              <h1>Perfil de Jugador</h1>
              <p>Panel gamificado de progreso academico basado en SIIAU.</p>
            </div>
          </div>
        </header>

        {(offerState.status === 'idle' || offerState.status === 'error') && (
          <div className="academic-profile-state glass-panel">
            <AlertCircle size={18} />
            <p>
              Aun no hay datos cargados. Puedes sincronizar aqui mismo o abrir <Link to="/subjects">Oferta Academica</Link>.
            </p>
            <button
              type="button"
              className="profile-sync-btn"
              onClick={handleManualSync}
              disabled={!token}
            >
              <RefreshCw size={14} />
              {offerState.status === 'error' ? 'Reintentar sincronización' : 'Sincronizar ahora'}
            </button>
          </div>
        )}

        {offerState.status === 'loading' && (
          <div className="profile-loading-screen glass-panel animate-fade-in">
            <div className="profile-loading-content">
              <div className="profile-spinner-ring">
                <div className="profile-spinner-ring-inner" />
              </div>
              <h2>Sincronizando perfil</h2>
              <p>Consultando SIIAU y reconstruyendo progreso academico...</p>
              <div className="profile-loading-bar">
                <div className="profile-loading-bar-fill" />
              </div>
            </div>
          </div>
        )}

        {offerState.status === 'error' && <div className="academic-profile-state-error-detail">{offerState.error ?? 'No se pudo construir el perfil academico.'}</div>}

        {isReady && (
          <AcademicProfileHUD
            careerName={careerName}
            creditsEarned={hudCreditsEarned}
            creditsTotal={hudCreditsTotal}
            creditsMissingInfo={hudCreditsMissingInfo}
            average={hudAverage}
            completedClasses={hudCompletedClasses}
            pendingClasses={hudPendingClasses}
            cycleCreditsEarned={creditsEarned}
            cycleCreditsTotal={creditsTotal}
          />
        )}
      </section>
    </div>
  );
};
