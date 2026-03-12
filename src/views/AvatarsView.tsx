import { User, Info } from 'lucide-react';
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { buildFigureString, type FigurePart } from '../lib/figureString';
import './AvatarsView.css';

type Gender = 'M' | 'F';

type SetTypeInfo = {
  type: string;
  paletteId: number | null;
  mandatory: boolean;
};

type SetInfo = {
  id: number;
  gender: string;
  club: number;
  selectable: boolean;
  colorsCount: number;
};

type PaletteColor = {
  id: number;
  index?: number;
  club?: number;
  selectable?: boolean;
  hexCode?: string;
};

type SetCache = Record<string, SetInfo[]>;
type PaletteCache = Record<number, PaletteColor[]>;

const DEFAULT_TYPES = ['hd', 'ch', 'lg', 'sh', 'hr', 'ha', 'he', 'ea', 'fa', 'cc', 'ca', 'wa'];

const TYPE_LABELS: Record<string, string> = {
  hd: 'Cabeza',
  ch: 'Torso',
  lg: 'Piernas',
  sh: 'Zapatos',
  hr: 'Cabello',
  ha: 'Sombrero',
  he: 'Accesorio cabeza',
  ea: 'Ojos',
  fa: 'Cara',
  cc: 'Chaqueta',
  ca: 'Capa',
  wa: 'Cintura',
};

// All calls (JSON + images) go through the Vite proxy → localhost:3000
// Port 3030 (imager) is internal to Docker and not reachable from the browser.
const API_BASE = '/habbo-api';

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Error ${res.status}: ${await res.text()}`);
  return res.json();
}

function buildRenderUrl(figure: string, opts?: { size?: 'n' | 's'; direction?: number; format?: 'png' | 'gif'; action?: string }): string {
  const sp = new URLSearchParams({
    figure,
    size: opts?.size ?? 'n',
    direction: String(opts?.direction ?? 2),
    head_direction: String(opts?.direction ?? 2),
    action: opts?.action ?? 'std',
    gesture: 'std',
    img_format: opts?.format ?? 'png',
  });
  return `${API_BASE}/render?${sp.toString()}`;
}

function normalizeHex(val?: string): string | null {
  if (!val) return null;
  const c = val.replace(/^#|0x/i, '').trim();
  if (!/^[0-9a-fA-F]{3,8}$/.test(c)) return null;
  return `#${c}`;
}

function fallbackColor(id: number): string {
  return `hsl(${(id * 47) % 360} 65% 60%)`;
}

function normalizeColors(colors: number[], count: number, fallback: number): number[] {
  const next = [...colors];
  while (next.length < count) next.push(fallback);
  return next;
}

export const AvatarsView: React.FC = () => {
  const [gender, setGender] = useState<Gender>('M');
  const [setTypes, setSetTypes] = useState<SetTypeInfo[]>([]);
  const [setsByType, setSetsByType] = useState<SetCache>({});
  const [paletteById, setPaletteById] = useState<PaletteCache>({});
  const [parts, setParts] = useState<FigurePart[]>([]);
  const [activeType, setActiveType] = useState<string>('hd');
  const [activeColorSlot, setActiveColorSlot] = useState(0);
  const [loading, setLoading] = useState(true);
  const [initializing, setInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const figure = useMemo(() => buildFigureString(parts), [parts]);
  const renderUrl = useMemo(() => figure ? buildRenderUrl(figure, { size: 'n' }) : '', [figure]);

  const isFullyLoading = loading || initializing;

  // Debounced parts snapshot — used only for item tile previews.
  // Prevents flooding the imager with 20+ requests every time the user clicks.
  const [debouncedParts, setDebouncedParts] = useState<FigurePart[]>([]);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedParts(parts), 800);
    return () => clearTimeout(timer);
  }, [parts]);

  const activeSetType = useMemo(() => setTypes.find(s => s.type === activeType) ?? null, [setTypes, activeType]);
  const activeSets = useMemo(() => (setsByType[activeType] ?? []).filter(s => s.selectable), [setsByType, activeType]);
  const activePalette = useMemo(() => {
    if (activeSetType?.paletteId != null) return (paletteById[activeSetType.paletteId] ?? []).filter(c => c.selectable !== false);
    return [];
  }, [activeSetType, paletteById]);
  const activePart = useMemo(() => parts.find(p => p.type === activeType) ?? null, [parts, activeType]);
  const colorsCount = useMemo(() => {
    const set = activeSets.find(s => s.id === activePart?.setId);
    return set?.colorsCount ?? 1;
  }, [activeSets, activePart]);
  const defaultColorId = activePalette[0]?.id ?? 0;
  const normalizedColors = useMemo(() => normalizeColors(activePart?.colors ?? [], colorsCount, defaultColorId), [activePart, colorsCount, defaultColorId]);

  const ensureSets = useCallback(async (type: string, gnd: Gender): Promise<SetInfo[]> => {
    const key = `${type}:${gnd}`;
    if (setsByType[key]) return setsByType[key];
    const data = await fetchJSON<{ sets: SetInfo[] }>(`${API_BASE}/sets?type=${encodeURIComponent(type)}&gender=${gnd}`);
    setSetsByType(prev => ({ ...prev, [type]: data.sets }));
    return data.sets;
  }, [setsByType]);

  const ensurePalette = useCallback(async (paletteId: number | null): Promise<PaletteColor[]> => {
    if (!paletteId) return [];
    if (paletteById[paletteId]) return paletteById[paletteId];
    const data = await fetchJSON<{ colors: PaletteColor[] }>(`${API_BASE}/palette?id=${paletteId}`);
    setPaletteById(prev => ({ ...prev, [paletteId]: data.colors }));
    return data.colors;
  }, [paletteById]);

  // Load initial set types
  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchJSON<{ setTypes: SetTypeInfo[] }>(`${API_BASE}/settypes`)
      .then(data => {
        setSetTypes(data.setTypes);
        setLoading(false);
      })
      .catch(_err => {
        setError('No se pudo conectar al servicio de avatares en localhost:3000. ¿Está corriendo el Habbo Generator?');
        setLoading(false);
      });
  }, []);

  // Load sets for active type when it changes
  useEffect(() => {
    if (!activeType || !setTypes.length) return;
    const st = setTypes.find(s => s.type === activeType);
    if (!st) return;
    Promise.all([
      ensureSets(activeType, gender),
      ensurePalette(st.paletteId),
    ]).catch(console.error);
  }, [activeType, gender, setTypes, ensureSets, ensurePalette]);

  // Bootstrap random avatar on first load
  useEffect(() => {
    if (!setTypes.length || parts.length > 0 || initializing) return;
    
    (async () => {
      setInitializing(true);
      const baseTypes = DEFAULT_TYPES.filter(t => setTypes.some(st => st.type === t));
      const loadedSets: SetCache = {};
      const loadedPalettes: PaletteCache = {};

      for (const t of baseTypes) {
        const st = setTypes.find(s => s.type === t);
        if (!st) continue;
        loadedSets[t] = await ensureSets(t, gender);
        if (st.paletteId != null) loadedPalettes[st.paletteId] = await ensurePalette(st.paletteId);
      }

      // Pick random visible parts
      const newParts: FigurePart[] = [];
      for (const t of ['hd', 'ch', 'lg', 'sh', 'hr']) {
        const st = setTypes.find(s => s.type === t)!;
        const sets = (loadedSets[t] ?? []).filter(s => s.selectable);
        if (!sets.length) continue;
        const chosen = sets[Math.floor(Math.random() * sets.length)];
        const palette = st.paletteId != null ? (loadedPalettes[st.paletteId] ?? []).filter(c => c.selectable !== false) : [];
        const col = palette.length ? palette[Math.floor(Math.random() * palette.length)].id : 1;
        newParts.push({ type: t, setId: chosen.id, colors: [col] });
      }
      
      const fig = buildFigureString(newParts);
      // Pre-load the image to avoid white flicker
      const img = new Image();
      img.src = buildRenderUrl(fig, { size: 'n' });
      await new Promise(resolve => {
        img.onload = resolve;
        img.onerror = resolve; // Continue even on error
      });

      setParts(newParts);
      setInitializing(false);
    })().catch(err => {
      console.error(err);
      setInitializing(false);
    });
  }, [setTypes, gender, parts.length, ensureSets, ensurePalette, initializing]);

  function handleSelectSet(set: SetInfo) {
    const defaults = Array.from({ length: Math.max(1, set.colorsCount) }, () => defaultColorId);
    const colors = activePart?.setId === set.id
      ? normalizeColors(activePart.colors ?? [], set.colorsCount, defaultColorId)
      : defaults;
    setParts(prev => {
      const next = prev.filter(p => p.type !== activeType);
      return [...next, { type: activeType, setId: set.id, colors }];
    });
  }

  function handlePickColor(colorId: number) {
    const next = normalizeColors(activePart?.colors ?? [], colorsCount, defaultColorId);
    next[activeColorSlot] = colorId;
    setParts(prev => prev.map(p => p.type === activeType ? { ...p, colors: next } : p));
  }



  return (
    <div className="avatars-container animate-fade-in">
      <div className="avatars-header">
        <div className="header-title">
          <div className="icon-wrapper"><User size={28} /></div>
          <div>
            <h1>Habbo Avatar</h1>
            <p>Personaliza tu identidad virtual para el CuceiVerse.</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="av-error glass-panel">
          <Info size={18} />
          <span>{error}</span>
        </div>
      )}

      {isFullyLoading ? (
        <div className="av-loading-screen glass-panel animate-fade-in">
          <div className="loading-content">
            <div className="av-spinner-ring">
              <div className="inner-ring"></div>
            </div>
            <h2>Sincronizando</h2>
            <p>Preparando items, colores y archivos .nitro...</p>
            <div className="loading-bar">
              <div className="loading-bar-fill"></div>
            </div>
          </div>
        </div>
      ) : !error && (
        <div className="avatars-layout">
          {/* Left: Preview */}
          <div className="preview-panel glass-panel">
            <div className="avatar-viewer">
              {figure ? (
                <img src={renderUrl} alt="Avatar" className="avatar-img" key={renderUrl} />
              ) : (
                <div className="av-placeholder"><User size={64} opacity={0.2} /></div>
              )}
            </div>
          </div>

          {/* Right: Editor */}
          <div className="editor-panel glass-panel">
            <div className="gender-selector">
              {(['M', 'F'] as Gender[]).map(g => (
                <button
                  key={g}
                  className={`gender-btn ${gender === g ? 'active' : ''}`}
                  onClick={() => { setGender(g); setParts([]); setSetsByType({}); }}
                >
                  {g === 'M' ? 'Masculino' : 'Femenino'}
                </button>
              ))}
            </div>

            <div className="editor-body">
              {/* Category rail */}
              <nav className="type-rail">
                {DEFAULT_TYPES.filter(t => setTypes.some(s => s.type === t)).map(type => (
                  <button
                    key={type}
                    className={`type-btn ${activeType === type ? 'active' : ''}`}
                    onClick={() => setActiveType(type)}
                  >
                    {TYPE_LABELS[type] ?? type.toUpperCase()}
                  </button>
                ))}
              </nav>

              <div className="items-selector">
                <div className="items-header">
                  <h3>{TYPE_LABELS[activeType] ?? activeType}</h3>
                  <span className="count-badge">{activeSets.length} items</span>
                </div>

                {/* Items grid */}
                <div className="items-grid">
                  {activeSets.map(set => {
                    const isActive = activePart?.setId === set.id;
                    const previewFigure = buildFigureString([
                      ...debouncedParts.filter(p => p.type !== activeType),
                      { type: activeType, setId: set.id, colors: activePart?.colors ?? [defaultColorId] },
                    ]);
                    const previewUrl = buildRenderUrl(previewFigure, { size: 's' });
                    return (
                      <button
                        key={set.id}
                        className={`item-tile glass-panel ${isActive ? 'active' : ''}`}
                        onClick={() => handleSelectSet(set)}
                        title={`Set ${set.id}`}
                      >
                        <img src={previewUrl} alt={`set ${set.id}`} loading="lazy" className="item-preview" />
                      </button>
                    );
                  })}
                </div>

                {/* Color palette */}
                {activePalette.length > 0 && (
                  <div className="palette-section">
                    <div className="palette-header">
                      <h3>Colores</h3>
                      <div className="color-slots">
                        {[0, 1].slice(0, colorsCount).map(slot => (
                          <button
                            key={slot}
                            className={`color-slot-btn ${activeColorSlot === slot ? 'active' : ''}`}
                            onClick={() => setActiveColorSlot(slot)}
                            disabled={!activePart?.setId}
                          >
                            Color {slot + 1}
                            <span
                              className="slot-swatch"
                              style={{ background: normalizeHex(activePalette.find(c => c.id === normalizedColors[slot])?.hexCode) ?? fallbackColor(normalizedColors[slot]) }}
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="colors-grid">
                      {activePalette.map(color => {
                        const hex = normalizeHex(color.hexCode) ?? fallbackColor(color.id);
                        const isSelected = normalizedColors[activeColorSlot] === color.id;
                        return (
                          <button
                            key={color.id}
                            className={`color-swatch ${isSelected ? 'selected' : ''}`}
                            style={{ '--swatch-color': hex } as React.CSSProperties}
                            onClick={() => handlePickColor(color.id)}
                            title={hex}
                            disabled={!activePart?.setId}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
