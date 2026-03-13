import type { EditorTool } from '../hooks/useMapEditor';
import './ToolPalette.css';

type Props = {
  activeTool: EditorTool;
  onToolChange: (tool: EditorTool) => void;
  isDirty: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
};

const TOOLS: { id: EditorTool; icon: string; label: string }[] = [
  { id: 'select', icon: '↖', label: 'Seleccionar' },
  { id: 'building', icon: '🏢', label: 'Edificios' },
  { id: 'area', icon: '🟩', label: 'Zonas' },
  { id: 'poi', icon: '📍', label: 'Añadir POI' },
  { id: 'asset', icon: '🌳', label: 'Mobiliario/Vegetación' },
  { id: 'walkway', icon: '🛤', label: 'Nodo pasillo' },
  { id: 'edge', icon: '🔗', label: 'Conectar nodos' },
  { id: 'erase', icon: '🗑', label: 'Borrar' },
];

export function ToolPalette({
  activeTool,
  onToolChange,
  isDirty,
  saving,
  onSave,
  onDiscard,
}: Props) {
  return (
    <div className="tool-palette">
      <p className="tool-palette__title">🏗 Modo Edición</p>

      <div className="tool-palette__tools">
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            type="button"
            title={tool.label}
            className={`tool-btn${activeTool === tool.id ? ' tool-btn--active' : ''}`}
            onClick={() => onToolChange(tool.id)}
          >
            <span className="tool-btn__icon">{tool.icon}</span>
            <small className="tool-btn__label">{tool.label}</small>
          </button>
        ))}
      </div>

      <div className="tool-palette__legend">
        {activeTool === 'poi' && <span>Clic en la cuadrícula para colocar un POI</span>}
        {activeTool === 'asset' && <span>Clic para colocar mobiliario/vegetación</span>}
        {activeTool === 'walkway' && <span>Clic para añadir nodo de pasillo</span>}
        {activeTool === 'edge' && <span>Clic en nodo A y luego nodo B para crear arista</span>}
        {activeTool === 'building' && <span>Base de polígonos de edificios (modo calibración)</span>}
        {activeTool === 'area' && <span>Base de polígonos de zonas (modo calibración)</span>}
        {activeTool === 'erase' && <span>Clic sobre POI/elemento/arista para eliminar</span>}
        {activeTool === 'select' && <span>Herramienta de selección activa</span>}
      </div>

      {isDirty && (
        <div className="tool-palette__actions">
          <button
            type="button"
            className="save-btn"
            onClick={onSave}
            disabled={saving}
          >
            {saving ? 'Guardando…' : '💾 Guardar'}
          </button>
          <button
            type="button"
            className="discard-btn"
            onClick={onDiscard}
            disabled={saving}
          >
            Descartar
          </button>
        </div>
      )}
    </div>
  );
}
