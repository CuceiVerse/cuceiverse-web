import type { DragEvent as ReactDragEvent } from 'react';

import type { BlockFootprint, EditorTool, PropKind } from '../editor/modularMapTypes';

const DROP_MIME = 'application/x-cuceiverse-map-item';

type Props = {
  layout?: 'vertical' | 'horizontal';
  variant?:
    | 'full'
    | 'tools-only'
    | 'props-only'
    | 'content-only'
    | 'content-no-props'
    | 'tools-plus-props';
  activeTool: EditorTool;
  activePropKind: PropKind;
  activeAreaPaletteId: string;
  activeBuildingPaletteId: string;
  buildingCount: number;
  pathCount: number;
  propCount: number;
  isDirty: boolean;
  onToolChange: (tool: EditorTool) => void;
  onPropKindChange: (kind: PropKind) => void;
  onAreaPresetChange: (paletteId: string, footprint: BlockFootprint) => void;
  onBuildingPresetChange: (paletteId: string, footprint: BlockFootprint) => void;
  onSave: () => void;
  onReset: () => void;
};

const TOOLS: Array<{ id: EditorTool; label: string; icon: string; help: string }> = [
  { id: 'select', label: 'Seleccion', icon: '↖', help: 'Selecciona edificios o arrastra props ya colocados.' },
  { id: 'area-block', label: 'Area', icon: '▣', help: 'Expande el area verde del mapa sin crear edificios.' },
  { id: 'building-block', label: 'Constructor', icon: '▦', help: 'Construye edificios usando bloques del tamano seleccionado.' },
  { id: 'path-brush', label: 'Brush', icon: '▓', help: 'Mantén clic y pinta pasillos de forma continua.' },
  { id: 'prop', label: 'Props 1x1', icon: '•', help: 'Haz clic o arrastra un prop individual al grid.' },
  { id: 'erase', label: 'Borrar', icon: '⌫', help: 'Borra con clic individual o arrastre continuo sobre pasillos, props o bloques.' },
  { id: 'pan', label: 'Pan', icon: '✥', help: 'Desplaza la cámara con Space + arrastre.' },
];

const PROPS: Array<{ kind: PropKind; label: string; accent: string }> = [
  { kind: 'tree', label: 'Árbol', accent: '#3a8c57' },
  { kind: 'access-vehicular', label: 'Acceso vehicular', accent: '#f59e0b' },
  { kind: 'access-pedestrian', label: 'Acceso peatonal', accent: '#22c55e' },
  { kind: 'asphalt', label: 'Asfalto', accent: '#334155' },
  { kind: 'car', label: 'Auto', accent: '#ef4444' },
  { kind: 'motorcycle', label: 'Moto', accent: '#f97316' },
  { kind: 'park', label: 'Parque', accent: '#16a34a' },
  { kind: 'bench', label: 'Banca', accent: '#9b6737' },
  { kind: 'bathroom', label: 'Baños', accent: '#3674c2' },
  { kind: 'poi', label: 'Punto de interes', accent: '#d35c82' },
  { kind: 'track', label: 'Pista', accent: '#f97316' },
  { kind: 'shrub', label: 'Arbusto', accent: '#5f9a4d' },
  { kind: 'trash', label: 'Basurero', accent: '#738090' },
];

const BUILDING_PRESETS: Array<{ paletteId: string; label: string; footprint: BlockFootprint }> = [
  { paletteId: 'building-1x1', label: 'Modulo 1x1', footprint: { width: 1, height: 1 } },
  { paletteId: 'building-2x2', label: 'Modulo 2x2', footprint: { width: 2, height: 2 } },
  { paletteId: 'building-3x2', label: 'Modulo 3x2', footprint: { width: 3, height: 2 } },
  { paletteId: 'building-4x2', label: 'Modulo 4x2', footprint: { width: 4, height: 2 } },
  { paletteId: 'building-3x3', label: 'Modulo 3x3', footprint: { width: 3, height: 3 } },
];

const AREA_PRESETS: Array<{ paletteId: string; label: string; footprint: BlockFootprint }> = [
  { paletteId: 'area-1x1', label: 'Area 1x1', footprint: { width: 1, height: 1 } },
  { paletteId: 'area-2x2', label: 'Area 2x2', footprint: { width: 2, height: 2 } },
  { paletteId: 'area-4x4', label: 'Area 4x4', footprint: { width: 4, height: 4 } },
  { paletteId: 'area-8x8', label: 'Area 8x8', footprint: { width: 8, height: 8 } },
];

function handleDragStart(event: ReactDragEvent<HTMLElement>, payload: unknown) {
  event.dataTransfer.effectAllowed = 'copy';
  event.dataTransfer.setData(DROP_MIME, JSON.stringify(payload));
}

export function ModularToolPalette({
  layout = 'vertical',
  variant = 'full',
  activeTool,
  activePropKind,
  activeAreaPaletteId,
  activeBuildingPaletteId,
  buildingCount,
  pathCount,
  propCount,
  isDirty,
  onToolChange,
  onPropKindChange,
  onAreaPresetChange,
  onBuildingPresetChange,
  onSave,
  onReset,
}: Props) {
  const isPropsCarousel = layout === 'horizontal' && variant === 'props-only';
  const activeHelp = TOOLS.find((tool) => tool.id === activeTool)?.help ?? 'Selecciona una herramienta.';
  const showToolsPanel =
    variant === 'full' || variant === 'tools-only' || variant === 'tools-plus-props';
  const showAreaPanel = variant === 'full' || variant === 'content-only' || variant === 'content-no-props';
  const showBuildingPanel =
    variant === 'full' || variant === 'content-only' || variant === 'content-no-props';
  const showPropsPanel =
    variant === 'full' ||
    variant === 'content-only' ||
    variant === 'tools-plus-props' ||
    variant === 'props-only';
  const showStatsPanel = variant === 'full' || variant === 'content-only' || variant === 'content-no-props';
  const paletteClass =
    layout === 'horizontal'
      ? `modular-palette modular-palette--horizontal modular-palette--${variant}`
      : 'modular-palette';

  return (
    <aside className={paletteClass}>
      {showToolsPanel ? (
        <div className="modular-panel glass-panel">
          <p className="modular-panel__eyebrow">Modo edición</p>
          <h2>Mapa modular</h2>

          <div className="modular-tool-grid grid grid-cols-3 gap-2 w-full">
            {TOOLS.map((tool) => (
              <button
                key={tool.id}
                type="button"
                className={`modular-tool flex flex-col items-center justify-center p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors border border-transparent hover:border-slate-500 w-full aspect-square${activeTool === tool.id ? ' modular-tool--active' : ''}`}
                onClick={() => onToolChange(tool.id)}
                title={tool.help}
              >
                <span className="text-lg leading-none mb-1">{tool.icon}</span>
                <strong className="text-[10px] leading-tight text-center text-slate-300 break-words line-clamp-2 font-medium">{tool.label}</strong>
              </button>
            ))}
          </div>

          <p className="modular-help">{activeHelp}</p>
        </div>
      ) : null}

      {showAreaPanel ? (
      <div className="modular-panel glass-panel">
        <div className="modular-section-head">
          <h3>Bloques de area</h3>
          <span>{AREA_PRESETS.length} tamanos</span>
        </div>

        <div className="modular-prop-list">
          {AREA_PRESETS.map((preset) => (
            <button
              key={preset.paletteId}
              type="button"
              draggable
              className={`modular-drag-card${
                activeAreaPaletteId === preset.paletteId ? ' modular-drag-card--active' : ''
              }`}
              onClick={() => {
                onAreaPresetChange(preset.paletteId, preset.footprint);
                onToolChange('area-block');
              }}
              onDragStart={(event) => {
                onAreaPresetChange(preset.paletteId, preset.footprint);
                onToolChange('area-block');
                handleDragStart(event, {
                  kind: 'area-block',
                  paletteId: preset.paletteId,
                  footprint: preset.footprint,
                });
              }}
            >
              <span className="modular-drag-card__swatch" style={{ background: '#7bb864' }} />
              <div>
                <strong>{preset.label}</strong>
                <small>Solo expande superficie verde</small>
              </div>
            </button>
          ))}
        </div>
      </div>
      ) : null}

      {showBuildingPanel ? (
      <div className="modular-panel glass-panel">
        <div className="modular-section-head">
          <h3>Constructor de edificios</h3>
          <span>{BUILDING_PRESETS.length} tamanos</span>
        </div>

        <div className="modular-prop-list">
          {BUILDING_PRESETS.map((preset) => (
            <button
              key={preset.paletteId}
              type="button"
              draggable
              className={`modular-drag-card modular-drag-card--building${
                activeBuildingPaletteId === preset.paletteId ? ' modular-drag-card--active' : ''
              }`}
              onClick={() => {
                onBuildingPresetChange(preset.paletteId, preset.footprint);
                onToolChange('building-block');
              }}
              onDragStart={(event) => {
                onBuildingPresetChange(preset.paletteId, preset.footprint);
                onToolChange('building-block');
                handleDragStart(event, {
                  kind: 'building-block',
                  paletteId: preset.paletteId,
                  footprint: preset.footprint,
                });
              }}
            >
              <span className="modular-drag-card__swatch modular-drag-card__swatch--building" />
              <div>
                <strong>{preset.label}</strong>
                <small>{preset.footprint.width}x{preset.footprint.height}</small>
              </div>
            </button>
          ))}
        </div>
      </div>
      ) : null}

      {showPropsPanel ? (
      <div className="modular-panel glass-panel">
        <div className="modular-section-head">
          <h3>Props</h3>
          <span>1x1</span>
        </div>

        <div className="modular-prop-list">
          {PROPS.map((prop) => (
            <button
              key={prop.kind}
              type="button"
              draggable
              className={`modular-drag-card${activePropKind === prop.kind ? ' modular-drag-card--active' : ''}${isPropsCarousel ? ' shrink-0' : ''}`}
              onClick={() => {
                onToolChange('prop');
                onPropKindChange(prop.kind);
              }}
              onDragStart={(event) => {
                onToolChange('prop');
                onPropKindChange(prop.kind);
                handleDragStart(event, { kind: 'prop', propKind: prop.kind });
              }}
            >
              <span className="modular-drag-card__swatch" style={{ background: prop.accent }} />
              <div>
                <strong>{prop.label}</strong>
                <small>{prop.kind}</small>
              </div>
            </button>
          ))}
        </div>
      </div>
      ) : null}

      {showStatsPanel ? (
      <div className="modular-panel glass-panel modular-panel--stats">
        <div className="modular-stat">
          <span>Edificios</span>
          <strong>{buildingCount}</strong>
        </div>
        <div className="modular-stat">
          <span>Pasillos</span>
          <strong>{pathCount}</strong>
        </div>
        <div className="modular-stat">
          <span>Props</span>
          <strong>{propCount}</strong>
        </div>

        <div className="modular-actions flex flex-col gap-3 mt-6 mb-4">
          <button
            type="button"
            className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium transition-all duration-200 shadow-lg shadow-indigo-500/25 active:scale-[0.98] flex items-center justify-center gap-2"
            onClick={onSave}
          >
            Guardar mapa
          </button>

          <button
            type="button"
            className="w-full py-2.5 px-4 bg-slate-800/50 hover:bg-red-500/10 border border-slate-700 hover:border-red-500/50 text-slate-300 hover:text-red-400 rounded-xl font-medium transition-all duration-200 active:scale-[0.98]"
            onClick={onReset}
          >
            Reset seed
          </button>

        </div>

        <p className={`modular-dirty${isDirty ? ' modular-dirty--active' : ''}`}>
          {isDirty ? 'Hay cambios sin exportar.' : 'El payload coincide con la última exportación.'}
        </p>
      </div>
      ) : null}
    </aside>
  );
}
