import React, { useMemo, useState } from 'react';
import { CalendarDays, Clock3, Building2, MapPin, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAcademicOffer } from '../context/useAcademicOffer';
import type { AcademicOfferRecord } from '../context/AcademicOfferContextStore';
import './StudentScheduleView.css';

type DayKey = 'L' | 'M' | 'I' | 'J' | 'V' | 'S' | 'D';
type ModalityKey = 'ALL' | 'VIRTUAL' | 'PRESENCIAL' | 'HIBRIDA' | 'POR_DEFINIR';

type ScheduleEntry = {
  day: DayKey;
  startMinutes: number;
  endMinutes: number;
  startLabel: string;
  endLabel: string;
  materia: string;
  clave: string;
  nrc: string;
  profesor: string;
  aula: string;
  edificio: string;
  periodo: string;
  sesion: string;
  modalidad: Exclude<ModalityKey, 'ALL'>;
  color: string;
};

type ScheduleMatch = {
  scheduled: ScheduleEntry[];
  unmatchedNrc: string[];
};

const DAY_ORDER: DayKey[] = ['L', 'M', 'I', 'J', 'V', 'S', 'D'];

const DAY_LABEL: Record<DayKey, string> = {
  L: 'Lunes',
  M: 'Martes',
  I: 'Miércoles',
  J: 'Jueves',
  V: 'Viernes',
  S: 'Sábado',
  D: 'Domingo',
};

const DAY_FILTER_OPTIONS: Array<'ALL' | DayKey> = ['ALL', ...DAY_ORDER];
const MODALITY_FILTER_OPTIONS: ModalityKey[] = [
  'ALL',
  'VIRTUAL',
  'PRESENCIAL',
  'HIBRIDA',
  'POR_DEFINIR',
];

const MODALITY_LABEL: Record<ModalityKey, string> = {
  ALL: 'Cualquier modalidad',
  VIRTUAL: 'Virtual (en linea)',
  PRESENCIAL: 'Presencial (en campus)',
  HIBRIDA: 'Hibrida (virtual + presencial)',
  POR_DEFINIR: 'Sin definir',
};

function resolveModality(edificio: string): Exclude<ModalityKey, 'ALL'> {
  const value = (edificio ?? '').toUpperCase().trim();
  if (!value || value === 'N/A' || value === 'UNDEFINED') {
    return 'POR_DEFINIR';
  }

  if (value.includes('DESV')) {
    return value.length > 7 ? 'HIBRIDA' : 'VIRTUAL';
  }

  return 'PRESENCIAL';
}

function subjectColorSeed(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) % 360;
  }
  return `hsl(${hash} 82% 58%)`;
}

function normalizeTimeLabel(raw: string): string {
  if (!raw) return '--:--';
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 4) return raw;
  return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
}

function toMinutes(raw: string): number {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 4) return Number.MAX_SAFE_INTEGER;
  const hh = Number(digits.slice(0, 2));
  const mm = Number(digits.slice(2, 4));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return Number.MAX_SAFE_INTEGER;
  return hh * 60 + mm;
}

function parseHourRange(raw: string | null | undefined): {
  startMinutes: number;
  endMinutes: number;
  startLabel: string;
  endLabel: string;
} {
  const value = (raw ?? '').trim();
  const [startRaw = '', endRaw = ''] = value.split('-');

  return {
    startMinutes: toMinutes(startRaw),
    endMinutes: toMinutes(endRaw),
    startLabel: normalizeTimeLabel(startRaw),
    endLabel: normalizeTimeLabel(endRaw),
  };
}

function parseDays(raw: string | null | undefined): DayKey[] {
  const source = (raw ?? '').toUpperCase();
  if (!source) return [];

  const compact = source.replace(/\s+/g, '');
  const template = ['L', 'M', 'I', 'J', 'V', 'S'];

  if (compact.length >= 6 && /^[LMIJVS\.]+$/.test(compact)) {
    const out: DayKey[] = [];
    for (let i = 0; i < Math.min(template.length, compact.length); i += 1) {
      if (compact[i] !== '.') {
        out.push(template[i] as DayKey);
      }
    }
    return out;
  }

  const out = DAY_ORDER.filter((day) => compact.includes(day));
  return out;
}

function buildScheduleByNrcMatch(
  offerRecords: AcademicOfferRecord[],
  studentNrcSet: Set<string>,
): ScheduleMatch {
  const scheduled: ScheduleEntry[] = [];
  const matchedNrc = new Set<string>();

  for (const offer of offerRecords) {
    const nrc = String(offer.NRC ?? '').trim();
    if (!nrc || !studentNrcSet.has(nrc)) continue;

    matchedNrc.add(nrc);
    const days = parseDays(offer.Dias);
    const range = parseHourRange(offer.Hora != null ? String(offer.Hora) : null);

    for (const day of days) {
      scheduled.push({
        day,
        startMinutes: range.startMinutes,
        endMinutes: range.endMinutes,
        startLabel: range.startLabel,
        endLabel: range.endLabel,
        materia: offer.Materia,
        clave: offer.Clave,
        nrc,
        profesor: offer.Profesor || 'Profesor por definir',
        aula: String(offer.Aula || 'N/A'),
        edificio: String(offer.Edificio || 'N/A'),
        periodo: 'Horario derivado de Oferta Académica',
        sesion: '--',
        modalidad: resolveModality(String(offer.Edificio || 'N/A')),
        color: subjectColorSeed(`${offer.Clave}-${offer.Materia}`),
      });
    }
  }

  const unmatchedNrc = Array.from(studentNrcSet).filter((nrc) => !matchedNrc.has(nrc));

  scheduled.sort((a, b) => {
    if (a.day !== b.day) {
      return DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day);
    }
    if (a.startMinutes !== b.startMinutes) {
      return a.startMinutes - b.startMinutes;
    }
    return a.materia.localeCompare(b.materia);
  });

  return { scheduled, unmatchedNrc };
}

export const StudentScheduleView: React.FC = () => {
  const { state: offerState } = useAcademicOffer();
  const [dayFilter, setDayFilter] = useState<'ALL' | DayKey>('ALL');
  const [professorFilter, setProfessorFilter] = useState('ALL');
  const [modalityFilter, setModalityFilter] = useState<ModalityKey>('ALL');

  const studentNrcSet = useMemo(() => {
    const set = new Set<string>();
    for (const course of offerState.snapshot?.courses ?? []) {
      const nrc = String(course.nrc ?? '').trim();
      if (nrc) set.add(nrc);
    }
    return set;
  }, [offerState.snapshot?.courses]);

  const scheduleMatch = useMemo(
    () => buildScheduleByNrcMatch(offerState.offerRecords, studentNrcSet),
    [offerState.offerRecords, studentNrcSet],
  );

  const entries = scheduleMatch.scheduled;

  const unscheduled = scheduleMatch.unmatchedNrc;
  const matchedNrcCount = useMemo(() => {
    const keys = new Set(entries.map((entry) => entry.nrc));
    return keys.size;
  }, [entries]);

  const professorOptions = useMemo(() => {
    const values = new Set<string>();
    for (const entry of entries) {
      const name = entry.profesor.trim();
      if (name) {
        values.add(name);
      }
    }

    return ['ALL', ...Array.from(values).sort((a, b) => a.localeCompare(b))];
  }, [entries]);

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      const byDay = dayFilter === 'ALL' || entry.day === dayFilter;
      const byProfessor =
        professorFilter === 'ALL' || entry.profesor === professorFilter;
      const byModality =
        modalityFilter === 'ALL' || entry.modalidad === modalityFilter;
      return byDay && byProfessor && byModality;
    });
  }, [entries, dayFilter, professorFilter, modalityFilter]);

  const groupedByDay = useMemo(() => {
    const out: Record<DayKey, ScheduleEntry[]> = {
      L: [],
      M: [],
      I: [],
      J: [],
      V: [],
      S: [],
      D: [],
    };

    for (const entry of filteredEntries) {
      out[entry.day].push(entry);
    }

    return out;
  }, [filteredEntries]);

  const visibleDays = useMemo(() => {
    if (dayFilter === 'ALL') return DAY_ORDER;
    return [dayFilter];
  }, [dayFilter]);

  const isLoading = offerState.status === 'loading';
  const isIdle = offerState.status === 'idle';

  return (
    <div className="student-schedule-scroll-area">
      <section className="student-schedule-container animate-fade-in">
        <header className="student-schedule-header">
          <div className="schedule-title-block">
            <div className="schedule-title-icon">
              <CalendarDays size={24} />
            </div>
            <div>
              <h1>Horario del Estudiante</h1>
              <p>
                Vista semanal construida desde la Oferta Académica sincronizada en SIIAU.
              </p>
            </div>
          </div>

          {offerState.snapshot && (
            <div className="schedule-stats glass-panel">
              <span>Total materias alumno: {offerState.snapshot.stats.total_courses}</span>
              <span>NRC con match en oferta: {matchedNrcCount}</span>
              <span>Bloques visibles: {filteredEntries.length}</span>
            </div>
          )}
        </header>

        {isIdle && (
          <div className="schedule-state glass-panel">
            <AlertCircle size={18} />
            <p>
              Cargando oferta académica global... Primero abre{' '}
              <Link to="/subjects">Oferta Académica</Link> para sincronizar datos.
            </p>
          </div>
        )}

        {!isIdle && offerState.offerRecords.length === 0 && (
          <div className="schedule-state glass-panel">
            <AlertCircle size={18} />
            <p>
              No hay oferta académica global en memoria. Abre{' '}
              <Link to="/subjects">Oferta Académica</Link> para inicializarla.
            </p>
          </div>
        )}

        {!isLoading && offerState.snapshot && (
          <section className="schedule-filters glass-panel">
            <label>
              Dia de clase
              <select
                value={dayFilter}
                onChange={(event) => setDayFilter(event.target.value as 'ALL' | DayKey)}
              >
                {DAY_FILTER_OPTIONS.map((day) => (
                  <option key={day} value={day}>
                    {day === 'ALL' ? 'Cualquier dia' : DAY_LABEL[day]}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Docente
              <select
                value={professorFilter}
                onChange={(event) => setProfessorFilter(event.target.value)}
              >
                {professorOptions.map((professor) => (
                  <option key={professor} value={professor}>
                    {professor === 'ALL' ? 'Cualquier docente' : professor}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Tipo de clase
              <select
                value={modalityFilter}
                onChange={(event) => setModalityFilter(event.target.value as ModalityKey)}
              >
                {MODALITY_FILTER_OPTIONS.map((modality) => (
                  <option key={modality} value={modality}>
                    {MODALITY_LABEL[modality]}
                  </option>
                ))}
              </select>
            </label>
          </section>
        )}

        {isLoading && (
          <div className="schedule-state glass-panel">
            <div className="state-spinner" />
            <p>Cargando oferta académica desde el módulo Oferta...</p>
          </div>
        )}

        {offerState.status === 'error' && (
          <div className="schedule-state glass-panel error">
            <AlertCircle size={18} />
            <p>{offerState.error ?? 'No se pudo obtener el horario del estudiante.'}</p>
          </div>
        )}

        {!isLoading && offerState.status === 'ready' && (
          <>
            <div className="schedule-grid">
              {visibleDays.map((day) => (
                <article key={day} className="day-column glass-panel">
                  <h2>{DAY_LABEL[day]}</h2>

                  {groupedByDay[day].length === 0 ? (
                    <p className="day-empty">Sin clases registradas.</p>
                  ) : (
                    <div className="day-sessions">
                      {groupedByDay[day].map((entry) => (
                        <div
                          key={`${entry.day}-${entry.nrc}-${entry.sesion}-${entry.startMinutes}`}
                          className="session-card"
                          style={{ borderLeftColor: entry.color }}
                        >
                          <div className="session-time">
                            <Clock3 size={14} />
                            <span>
                              {entry.startLabel} - {entry.endLabel}
                            </span>
                          </div>
                          <strong>{entry.materia}</strong>
                          <span className="session-meta">
                            {entry.clave} • NRC {entry.nrc} • Ses {entry.sesion}
                          </span>
                          <span className="session-meta">{entry.profesor}</span>
                          <div className="session-location">
                            <span>
                              <Building2 size={13} /> {entry.edificio}
                            </span>
                            <span>
                              <MapPin size={13} /> {entry.aula}
                            </span>
                          </div>
                          <span className="session-period">{entry.periodo}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>

            {unscheduled.length > 0 && (
              <section className="unscheduled-block glass-panel">
                <h3>NRC del alumno sin coincidencia en oferta global</h3>
                <div className="unscheduled-list">
                  {unscheduled.map((nrc) => (
                    <article key={nrc}>
                      <strong>NRC {nrc}</strong>
                      <span>Sin match dentro de la oferta global actual.</span>
                    </article>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </section>
    </div>
  );
};
