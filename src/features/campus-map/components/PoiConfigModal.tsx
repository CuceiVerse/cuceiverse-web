import { useEffect, useState } from 'react';

import type { PoiDraft } from '../editor/useModularMapStore';

type Props = {
  draft: PoiDraft | null;
  onClose: () => void;
  onSave: (draft: PoiDraft) => void;
};

export function PoiConfigModal({ draft, onClose, onSave }: Props) {
  const [label, setLabel] = useState('');
  const [interestRadius, setInterestRadius] = useState(2);

  useEffect(() => {
    if (!draft) {
      return;
    }
    setLabel(draft.label);
    setInterestRadius(draft.interestRadius);
  }, [draft]);

  if (!draft) {
    return null;
  }

  return (
    <div className="building-modal-backdrop" role="presentation" onClick={onClose}>
      <section className="building-modal glass-panel" onClick={(event) => event.stopPropagation()}>
        <p className="building-modal__eyebrow">Punto de interés</p>
        <h3>{draft.id}</h3>

        <label>
          Etiqueta del POI
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Ej. Biblioteca central"
          />
        </label>

        <label>
          Radio de área de interés (celdas)
          <input
            type="number"
            min={1}
            max={12}
            step={1}
            value={interestRadius}
            onChange={(event) => {
              const parsed = Number(event.target.value);
              const safe = Number.isFinite(parsed) ? Math.max(1, Math.min(12, Math.round(parsed))) : 1;
              setInterestRadius(safe);
            }}
          />
        </label>

        <div className="grid grid-cols-2 gap-3 w-full mt-5 pt-4 border-t border-slate-700/50">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium transition-all border border-slate-700 hover:border-slate-500 flex items-center justify-center"
          >
            Cerrar
          </button>

          <button
            type="button"
            onClick={() => onSave({ id: draft.id, label: label.trim(), interestRadius })}
            className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium transition-all shadow-md shadow-indigo-900/20 flex items-center justify-center"
          >
            Aplicar
          </button>
        </div>
      </section>
    </div>
  );
}
