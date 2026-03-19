import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  ExternalLink,
  Hourglass,
  Lock,
  Tag,
  Trophy,
  Info,
  ChevronDown,
  GraduationCap,
  Target,
  BookMarked,
  X,
} from 'lucide-react';

type CompletedClass = {
  id: string;
  name: string;
  grade?: number | null;
  description?: string | null;
};

type PendingClass = {
  id: string;
  name: string;
  xpReward: number;
};

type AcademicProfileHUDProps = {
  careerName: string;
  creditsEarned: number | null;
  creditsTotal: number | null;
  creditsMissingInfo?: string;
  cycleCreditsEarned: number;
  cycleCreditsTotal: number;
  average: number | null;
  completedClasses: CompletedClass[];
  pendingClasses: PendingClass[];
};

type RankMeta = {
  tier: string;
  label: string;
  glowColor: string;
  tierClass: string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatCredits(value: number | null): string {
  if (value == null || Number.isNaN(value)) return '--';
  return new Intl.NumberFormat('es-MX', {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}

function formatGrade(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return 'N/D';
  return value.toFixed(1);
}

function computeRank(average: number | null): RankMeta {
  if (average == null || Number.isNaN(average)) {
    return {
      tier: '?',
      label: 'Sin promedio disponible',
      glowColor: 'bg-slate-400/20',
      tierClass: 'text-slate-400',
    };
  }

  if (average >= 95) {
    return {
      tier: 'S',
      label: 'Legendario',
      glowColor: 'bg-amber-400/25',
      tierClass: 'text-amber-400',
    };
  }

  if (average >= 90) {
    return {
      tier: 'A',
      label: 'Elite',
      glowColor: 'bg-fuchsia-400/25',
      tierClass: 'text-fuchsia-400',
    };
  }

  if (average >= 80) {
    return {
      tier: 'B',
      label: 'Veterano',
      glowColor: 'bg-sky-400/25',
      tierClass: 'text-sky-400',
    };
  }

  return {
    tier: 'C',
    label: 'En progreso',
    glowColor: 'bg-rose-400/25',
    tierClass: 'text-rose-300',
  };
}

export const AcademicProfileHUD: React.FC<AcademicProfileHUDProps> = ({
  careerName,
  creditsEarned,
  creditsTotal,
  creditsMissingInfo,
  cycleCreditsEarned,
  cycleCreditsTotal,
  average,
  completedClasses,
  pendingClasses,
}) => {
  const navigate = useNavigate();
  const hasGlobalCredits =
    creditsEarned != null && creditsTotal != null && creditsTotal > 0;

  const progress = useMemo(() => {
    if (!hasGlobalCredits || creditsEarned == null || creditsTotal == null) return null;
    return clamp((creditsEarned / creditsTotal) * 100, 0, 100);
  }, [hasGlobalCredits, creditsEarned, creditsTotal]);

  const globalCreditsPending = useMemo(() => {
    if (!hasGlobalCredits || creditsEarned == null || creditsTotal == null) return null;
    return Math.max(creditsTotal - creditsEarned, 0);
  }, [hasGlobalCredits, creditsEarned, creditsTotal]);

  const level = useMemo(
    () => (progress == null ? 1 : Math.max(1, Math.ceil(progress / 10))),
    [progress]
  );

  const rank = useMemo(() => computeRank(average), [average]);
  const [showCreditsInfo, setShowCreditsInfo] = useState(false);
  const creditsInfoRef = useRef<HTMLDivElement | null>(null);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(
    completedClasses[0]?.id ?? null,
  );
  const [showSkillModal, setShowSkillModal] = useState(false);

  useEffect(() => {
    setSelectedSkillId((previous) => {
      if (completedClasses.length === 0) return null;
      if (previous && completedClasses.some((item) => item.id === previous)) return previous;
      return completedClasses[0].id;
    });
  }, [completedClasses]);

  const selectedSkill = useMemo(
    () => completedClasses.find((item) => item.id === selectedSkillId) ?? null,
    [completedClasses, selectedSkillId],
  );

  useEffect(() => {
    if (!showSkillModal) return;

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowSkillModal(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [showSkillModal]);

  useEffect(() => {
    if (!showCreditsInfo) return;

    const closeMenu = () => setShowCreditsInfo(false);

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (creditsInfoRef.current?.contains(target)) {
        return;
      }
      closeMenu();
    };

    window.addEventListener('scroll', closeMenu, true);
    window.addEventListener('wheel', closeMenu, { passive: true });
    window.addEventListener('touchmove', closeMenu, { passive: true });
    window.addEventListener('resize', closeMenu);
    window.addEventListener('keydown', closeMenu);
    document.addEventListener('pointerdown', handlePointerDown, true);

    return () => {
      window.removeEventListener('scroll', closeMenu, true);
      window.removeEventListener('wheel', closeMenu);
      window.removeEventListener('touchmove', closeMenu);
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('keydown', closeMenu);
      document.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [showCreditsInfo]);

  const scrollbarClasses =
    '[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-600/80 [&::-webkit-scrollbar-track]:bg-transparent';

  const handleOpenAcademicOffer = () => {
    setShowSkillModal(false);
    navigate('/subjects');
  };

  const skillModal =
    showSkillModal && selectedSkill && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="fixed inset-0 z-[9999] flex h-[100dvh] w-screen items-center justify-center bg-[#03060D]/80 p-4 backdrop-blur-md transition-opacity sm:p-6"
            onClick={() => setShowSkillModal(false)}
            role="presentation"
          >
            <article
              className="relative m-auto flex w-full max-w-3xl max-h-[calc(100dvh-2rem)] flex-col overflow-hidden rounded-[32px] border border-slate-700/50 bg-[#0B1121] shadow-[0_20px_100px_rgba(0,0,0,0.8)] sm:max-h-[calc(100dvh-3rem)]"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="skill-modal-title"
            >
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.1),transparent_70%)]" />

              <div
                className={`relative flex flex-1 flex-col gap-8 overflow-y-auto ${scrollbarClasses}`}
                style={{ padding: '2.5rem 3rem' }}
              >
                <div className="flex items-start justify-between gap-6">
                  <div className="flex items-center gap-5">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-slate-600/50 bg-slate-800/50 text-emerald-400 shadow-inner">
                      <BookOpen size={28} />
                    </div>
                    <div className="flex flex-col">
                      <p className="text-xs font-bold tracking-[0.2em] text-emerald-500/90">
                        DETALLE DE HABILIDAD
                      </p>
                      <h4
                        id="skill-modal-title"
                        className="mt-1.5 text-2xl font-black uppercase leading-tight text-white sm:text-3xl"
                      >
                        {selectedSkill.name}
                      </h4>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-800/80 text-slate-400 transition-colors hover:bg-slate-700 hover:text-white"
                    onClick={() => setShowSkillModal(false)}
                    aria-label="Cerrar detalle de habilidad"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  {selectedSkill.grade == null || Number.isNaN(selectedSkill.grade) ? (
                    <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm font-bold tracking-wide text-amber-400">
                      <Hourglass size={16} />
                      PENDIENTE DE CALIFICACIÓN
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm font-bold tracking-wide text-cyan-400">
                      <Trophy size={16} />
                      CALIFICACIÓN: {formatGrade(selectedSkill.grade)}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-2 rounded-full border border-slate-600 bg-slate-800/80 px-4 py-2 text-sm font-medium tracking-wide text-slate-300">
                    <Tag size={16} />
                    Clave: {selectedSkill.id}
                  </span>
                </div>

                <div className="rounded-2xl bg-slate-800/30 p-6 ring-1 ring-white/5">
                  <p className="text-base leading-relaxed text-slate-300">
                    {selectedSkill.description?.trim() || 'Habilidad fundamental en tu desarrollo académico. Consulta la oferta para conocer el desglose de competencias asociadas a esta materia y cómo impacta en tu perfil.'}
                  </p>
                </div>

                <div className="flex flex-col gap-4">
                  <p className="text-xs font-bold tracking-[0.2em] text-slate-500">
                    CONEXIONES DE HABILIDAD
                  </p>
                  <div className="flex items-center gap-5 rounded-2xl bg-slate-900/50 p-5 ring-1 ring-white/5">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-700/50 bg-slate-800 text-slate-400">
                      <Lock size={20} />
                    </div>
                    <div>
                      <p className="text-sm"><span className="font-semibold text-slate-200">Requisito para:</span> Habilidades de Niveles Superiores</p>
                      <p className="mt-1 text-sm text-slate-500">Forma parte del tronco común del área de estudio.</p>
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="group relative flex w-full shrink-0 items-center justify-center bg-cyan-500 px-6 py-5 transition-all hover:bg-cyan-400 hover:shadow-[0_-10px_30px_rgba(34,211,238,0.2)]"
                onClick={handleOpenAcademicOffer}
              >
                <span className="relative z-10 flex items-center gap-3 text-[15px] font-bold tracking-wide text-cyan-950">
                  VER OFERTA ACADÉMICA COMPLETA
                  <ExternalLink size={18} className="transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" />
                </span>
              </button>
            </article>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <section className="relative w-full overflow-hidden rounded-[32px] border border-indigo-500/15 bg-[#060915] p-5 text-slate-100 shadow-[0_20px_80px_rgba(0,0,0,0.45)] sm:p-6 lg:p-8">
        {/* GLOBAL BACKGROUND GLOW */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(91,33,182,0.15),transparent_50%)]" />
          <div className="absolute -left-20 bottom-0 h-64 w-64 rounded-full bg-violet-600/10 blur-3xl" />
          <div className="absolute -right-20 top-24 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />
        </div>

        <div className="relative z-10 grid grid-cols-1 gap-6 xl:grid-cols-12">
          {/* HERO */}
          <header className="relative flex flex-col items-center gap-y-16 overflow-visible rounded-[28px] border border-indigo-500/15 bg-[#0B1120] px-6 py-9 text-center shadow-[0_20px_50px_rgba(0,0,0,0.45)] sm:px-8 sm:py-10 xl:col-span-8">
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(34,211,238,0.08),transparent_50%)]" />
            </div>

            <div className="relative z-10 flex flex-col items-center shrink-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-400">
                PERFIL DE JUGADOR ACADÉMICO
              </p>
              <h2 className="mt-4 max-w-2xl text-[2rem] font-extrabold leading-tight text-white sm:text-[2.25rem]">
                Nivel {level} - {careerName}
              </h2>
            </div>

            <div className="relative z-10 flex flex-col items-center shrink-0">
              <div className="relative flex h-24 w-24 items-center justify-center rounded-full border border-cyan-300/20 bg-gradient-to-b from-cyan-300/20 via-cyan-400/15 to-cyan-500/10 text-cyan-300 ring-1 ring-cyan-200/10">
                <div className="pointer-events-none absolute left-1/2 top-1/2 h-[160%] w-[160%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400/20 blur-[40px]" />
                <div className="pointer-events-none absolute inset-0 rounded-full bg-cyan-300/10 blur-md" />
                <GraduationCap size={36} className="relative z-10" />
              </div>
              
              <div className="mt-8 text-7xl font-black leading-none text-cyan-400 sm:text-8xl">
                {(progress ?? 0).toFixed(1)}%
              </div>
              <p className="mt-6 text-xs font-medium uppercase tracking-[0.18em] text-slate-500 sm:text-sm">
                AVANCE DE CARRERA
              </p>
            </div>

            <div className="relative z-10 flex flex-col items-center w-full shrink-0">
              <div className="flex w-full flex-wrap justify-center gap-3 sm:gap-4 max-w-3xl">
                {hasGlobalCredits ? (
                  <>
                    <div className="flex flex-1 min-w-[145px] max-w-[180px] flex-col items-center justify-center rounded-[20px] border border-cyan-400/15 bg-cyan-400/5 px-2 py-4 backdrop-blur-sm shrink-0">
                      <p className="text-[10px] uppercase tracking-wider text-cyan-100/70">
                        CRÉDITOS ACUMULADOS
                      </p>
                      <p className="mt-2 text-3xl font-black text-cyan-300">
                        {formatCredits(creditsEarned)}
                      </p>
                    </div>
                    <div className="flex flex-1 min-w-[145px] max-w-[180px] flex-col items-center justify-center rounded-[20px] border border-amber-400/15 bg-amber-400/5 px-2 py-4 backdrop-blur-sm shrink-0">
                      <p className="text-[10px] uppercase tracking-wider text-amber-100/70">
                        CRÉDITOS FALTANTES
                      </p>
                      <p className="mt-2 text-3xl font-black text-amber-300">
                        {formatCredits(globalCreditsPending)}
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-1 min-w-[145px] max-w-[180px] flex-col items-center justify-center rounded-[20px] border border-cyan-400/15 bg-cyan-400/5 px-2 py-4 backdrop-blur-sm shrink-0">
                    <p className="text-[10px] uppercase tracking-wider text-cyan-100/70">
                      CRÉDITOS DEL CICLO
                    </p>
                    <p className="mt-2 text-3xl font-black text-cyan-300">
                      {formatCredits(cycleCreditsEarned)}
                    </p>
                  </div>
                )}
                <div className="flex flex-1 min-w-[145px] max-w-[180px] flex-col items-center justify-center rounded-[20px] border border-white/10 bg-white/5 px-2 py-4 backdrop-blur-sm shrink-0">
                  <p className="text-[10px] uppercase tracking-wider text-slate-300/70">
                    INSCRITOS ESTE CICLO
                  </p>
                  <p className="mt-2 text-3xl font-black text-slate-100">
                    {formatCredits(cycleCreditsTotal)}
                  </p>
                </div>
              </div>
            </div>

            <div className="relative z-10 w-full max-w-2xl flex flex-col items-center shrink-0">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800/80 ring-1 ring-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 via-cyan-400 to-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.6)] transition-all duration-1000 ease-out"
                  style={{ width: `${progress ?? 0}%` }}
                />
              </div>
              
              <div className="mt-4 text-xs font-medium text-slate-400">
                {hasGlobalCredits ? (
                  <p>
                    Experiencia de carrera:{' '}
                    <span className="text-slate-200">
                      {formatCredits(creditsEarned)} / {formatCredits(creditsTotal)}
                    </span>{' '}
                    créditos totales
                  </p>
                ) : (
                  <p className="text-amber-300/80">
                    * Mostrando avance por materias del ciclo actual
                  </p>
                )}
              </div>

              {creditsMissingInfo && (
                <div
                  ref={creditsInfoRef}
                  className="relative mt-6 flex w-full shrink-0 flex-col items-center"
                >
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/40 px-3.5 py-2 text-xs font-semibold text-slate-200 transition hover:border-white/20 hover:bg-slate-950/60"
                    onClick={() => setShowCreditsInfo((prev) => !prev)}
                    aria-expanded={showCreditsInfo}
                  >
                    <Info size={13} />
                    Más info de créditos
                    <ChevronDown
                      size={14}
                      className={`transition-transform ${showCreditsInfo ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {showCreditsInfo && (
                    <div className="absolute left-1/2 top-[calc(100%+10px)] z-40 w-full max-w-2xl -translate-x-1/2 rounded-2xl border border-white/15 bg-slate-950/95 px-4 py-3 text-left shadow-[0_20px_40px_rgba(0,0,0,0.45)] backdrop-blur-sm">
                      <p className="text-sm leading-relaxed text-slate-300/85">
                        {creditsMissingInfo}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </header>

          {/* RANK SUMMARY */}
          <aside className="xl:col-span-4">
            <div className="relative h-full overflow-hidden rounded-[28px] border border-slate-800/90 bg-[#0B1120] shadow-[0_20px_50px_rgba(0,0,0,0.45)]">
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(251,191,36,0.08),transparent_50%)]" />
                <div className="absolute -right-10 bottom-0 h-32 w-32 rounded-full bg-fuchsia-500/5 blur-3xl" />
              </div>

              <div className="relative z-10 flex h-full flex-col">
                <div className="flex flex-col items-center px-6 pb-6 pt-9 text-center sm:px-7 sm:pb-7 sm:pt-10">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-400">
                    RANGO GENERAL
                  </p>
                  <h3 className="mt-4 bg-gradient-to-r from-white via-slate-100 to-amber-200 bg-clip-text text-[2rem] font-extrabold leading-tight text-transparent sm:text-[2.25rem]">
                    {rank.label}
                  </h3>
                </div>

                <div className="flex flex-1 flex-col items-center justify-center px-6 pb-8 pt-2 text-center sm:px-7 sm:pb-10 sm:pt-3">
                  <div className="relative flex h-24 w-24 items-center justify-center rounded-full border border-amber-300/20 bg-gradient-to-b from-amber-300/20 via-amber-400/15 to-amber-500/10 text-amber-300 ring-1 ring-amber-200/10">
                    <div className={`pointer-events-none absolute left-1/2 top-1/2 h-[160%] w-[160%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[40px] ${rank.glowColor}`} />
                    <div className="pointer-events-none absolute inset-0 rounded-full bg-amber-300/10 blur-md" />
                    <Trophy size={34} className="relative z-10" />
                  </div>
                  
                  <div className={`mt-8 text-7xl font-black leading-none ${rank.tierClass}`}>
                    {rank.tier}
                  </div>
                  <p className="mt-6 text-xs font-medium uppercase tracking-[0.18em] text-slate-500 sm:text-sm">
                    Puntaje de Desempeño
                  </p>
                  <p className="mt-4 text-4xl font-black tracking-tight text-white sm:text-5xl">
                    {average == null ? '--' : average.toFixed(1)}
                  </p>
                </div>

                <div className="mt-auto flex flex-wrap items-center justify-center gap-2 px-6 pb-8 pt-2 sm:px-7 sm:pb-8">
                  <span className="rounded-full border border-amber-400/15 bg-slate-900/70 px-3 py-1.5 text-[11px] font-semibold text-amber-400 backdrop-blur-sm">
                    S: 95+
                  </span>
                  <span className="rounded-full border border-fuchsia-400/15 bg-slate-900/70 px-3 py-1.5 text-[11px] font-semibold text-fuchsia-400 backdrop-blur-sm">
                    A: 90+
                  </span>
                  <span className="rounded-full border border-sky-400/15 bg-slate-900/70 px-3 py-1.5 text-[11px] font-semibold text-sky-400 backdrop-blur-sm">
                    B: 80+
                  </span>
                  <span className="rounded-full border border-rose-300/10 bg-slate-900/70 px-3 py-1.5 text-[11px] font-semibold text-slate-400 backdrop-blur-sm">
                    C: &lt; 80
                  </span>
                </div>
              </div>
            </div>
          </aside>

          {/* SKILLS */}
          <section className="relative overflow-hidden rounded-[28px] border border-indigo-500/15 bg-[#0B1120] p-4 shadow-[0_20px_50px_rgba(0,0,0,0.45)] sm:p-6 lg:p-7 xl:col-span-7">
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.08),transparent_50%)]" />
            </div>

            <div className="relative z-10 flex flex-col h-full">
              <div className="flex flex-col items-center pt-2 pb-6 text-center sm:pt-4 sm:pb-8">
                <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-emerald-400/80">
                  HABILIDADES ADQUIRIDAS
                </p>
                <h3 className="mt-4 text-[1.85rem] font-extrabold leading-tight text-white sm:text-[2rem]">
                  Tu Árbol de Habilidades
                </h3>
              </div>
              <div className="flex-1 flex flex-col items-center justify-center text-center pb-6 sm:pb-8">
                <div className="relative flex h-24 w-24 items-center justify-center rounded-full border border-emerald-300/20 bg-gradient-to-b from-emerald-300/20 via-emerald-400/15 to-emerald-500/10 text-emerald-300 ring-1 ring-emerald-200/10">
                  <div className="pointer-events-none absolute left-1/2 top-1/2 h-[160%] w-[160%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-400/20 blur-[40px]" />
                  <div className="pointer-events-none absolute inset-0 rounded-full bg-emerald-300/10 blur-md" />
                  <BookMarked size={36} className="relative z-10" />
                </div>
                
                <div className="mt-8 text-7xl font-black leading-none text-emerald-400">
                  {completedClasses.length}
                </div>
                <p className="mt-6 text-xs font-medium uppercase tracking-[0.18em] text-slate-500 sm:text-sm">
                  HABILIDADES DESBLOQUEADAS
                </p>
              </div>
              <div className={`mt-2 flex-1 grid max-h-[380px] grid-cols-1 gap-2.5 overflow-auto pr-1 sm:grid-cols-2 ${scrollbarClasses}`}>
                {completedClasses.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSelectedSkillId(item.id);
                      setShowSkillModal(true);
                    }}
                    className={`group flex flex-col items-center justify-center text-center p-4 rounded-xl border transition hover:border-emerald-400/20 hover:bg-[#0d1836] ${selectedSkillId === item.id ? 'border-emerald-400/35 bg-[#0f1d3f]' : 'border-white/5 bg-[#0a132d]'}`}
                  >
                    <p className="truncate text-base font-bold text-slate-100 transition group-hover:text-white max-w-full">
                      {item.name}
                    </p>
                    <p className="mt-1 text-xs text-slate-400 max-w-full">
                      Click para abrir detalle de Kardex
                    </p>
                  </button>
                ))}
                {completedClasses.length === 0 && (
                  <div className="col-span-full flex min-h-[140px] items-center justify-center rounded-xl border border-dashed border-white/10 bg-slate-950/25 p-8 text-center text-sm text-slate-400">
                    Aún no has desbloqueado habilidades. ¡Sigue estudiando!
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* MISSIONS */}
          <section className="relative overflow-hidden rounded-[28px] border border-cyan-500/15 bg-[#0B1120] p-4 shadow-[0_20px_50px_rgba(0,0,0,0.45)] sm:p-6 lg:p-7 xl:col-span-5">
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(34,211,238,0.08),transparent_50%)]" />
            </div>

            <div className="relative z-10 flex flex-col h-full">
              <div className="flex flex-col items-center pt-2 pb-6 text-center sm:pt-4 sm:pb-8">
                <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-cyan-400/80">
                  MISIONES ACTIVAS
                </p>
                <h3 className="mt-4 text-[1.85rem] font-extrabold leading-tight text-white sm:text-[2rem]">
                  Misiones de Ciclo Actual
                </h3>
              </div>
              <div className="flex-1 flex flex-col items-center justify-center text-center pb-6 sm:pb-8">
                <div className="relative flex h-24 w-24 items-center justify-center rounded-full border border-cyan-300/20 bg-gradient-to-b from-cyan-300/20 via-cyan-400/15 to-cyan-500/10 text-cyan-300 ring-1 ring-cyan-200/10">
                  <div className="pointer-events-none absolute left-1/2 top-1/2 h-[160%] w-[160%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400/20 blur-[40px]" />
                  <div className="pointer-events-none absolute inset-0 rounded-full bg-cyan-300/10 blur-md" />
                  <Target size={36} className="relative z-10" />
                </div>
                
                <div className="mt-8 text-7xl font-black leading-none text-cyan-400">
                  {pendingClasses.length}
                </div>
                <p className="mt-6 text-xs font-medium uppercase tracking-[0.18em] text-slate-500 sm:text-sm">
                  MATERIAS EN CURSO
                </p>
              </div>
              <div className={`mt-2 flex-1 flex flex-col overflow-auto pr-1 ${scrollbarClasses}`}>
                {pendingClasses.length > 0 ? (
                  <div className="space-y-3">
                    {pendingClasses.map((quest) => (
                      <article
                        key={quest.id}
                        className="group flex flex-col items-center justify-center text-center p-4 rounded-xl border border-white/5 bg-[#0a132d] transition hover:border-cyan-400/20 hover:bg-[#0d1836]"
                      >
                        <p className="text-base font-bold text-slate-100 max-w-full">
                          {quest.name}
                        </p>
                        <p className="mt-1 text-xs text-slate-400 max-w-full">
                          Materia cursando este semestre
                        </p>
                        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                          <span className="rounded-full bg-cyan-400/10 px-3 py-1 text-[11px] font-bold text-cyan-300 ring-1 ring-cyan-400/20">
                            +{quest.xpReward} XP
                          </span>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-1 items-center justify-center">
                    <div className="w-full flex flex-col items-center justify-center text-center p-6 border border-dashed border-white/10 rounded-xl bg-slate-950/20">
                      <Target size={28} className="text-cyan-400/60" />
                      <p className="mt-4 text-lg font-bold text-slate-100/90">
                        Sin materias en curso
                      </p>
                      <p className="mt-1 text-sm text-slate-400">
                        No se encontraron materias inscritas en este semestre.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </section>

      {skillModal}
    </>
  );
};