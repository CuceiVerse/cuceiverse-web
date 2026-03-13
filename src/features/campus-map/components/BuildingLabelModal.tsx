import { useEffect, useState, type ChangeEvent } from 'react';

import type { BuildingLabelDraft, BuildingType } from '../editor/modularMapTypes';

type Props = {
  draft: BuildingLabelDraft | null;
  onChange: (draft: BuildingLabelDraft) => void;
  onClose: () => void;
  onSave: () => void;
};

const BUILDING_TYPE_OPTIONS: Array<{ value: BuildingType; label: string }> = [
  { value: 'academic', label: 'Académico' },
  { value: 'administrative', label: 'Administrativo' },
  { value: 'services', label: 'Servicios' },
  { value: 'sports', label: 'Deportivo' },
  { value: 'research', label: 'Investigación' },
  { value: 'mixed', label: 'Mixto' },
];

export function BuildingLabelModal({ draft, onChange, onClose, onSave }: Props) {
  const buildingTypes = ['Académico', 'Administrativo', 'Servicios', 'Deportivo', 'Investigación', 'Mixto'];
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [selectedType, setSelectedType] = useState('Académico');

  useEffect(() => {
    if (!draft) {
      return;
    }
    const nextSelectedType =
      BUILDING_TYPE_OPTIONS.find((option) => option.value === draft.type)?.label ?? 'Académico';
    setSelectedType(nextSelectedType);
  }, [draft]);

  if (!draft) {
    return null;
  }

  const handleNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange({ ...draft, name: event.target.value });
  };

  const handleTypeSelection = (typeLabel: string) => {
    const selectedOption = BUILDING_TYPE_OPTIONS.find((option) => option.label === typeLabel);
    if (!selectedOption) {
      return;
    }
    setSelectedType(typeLabel);
    onChange({ ...draft, type: selectedOption.value as BuildingType });
    setIsDropdownOpen(false);
  };

  return (
    <div className="building-modal-backdrop" role="presentation" onClick={onClose}>
      <section className="building-modal glass-panel" onClick={(event) => event.stopPropagation()}>
        <p className="building-modal__eyebrow">Etiquetado global</p>
        <h3>{draft.id}</h3>

        <label>
          Nombre del edificio
          <input value={draft.name} onChange={handleNameChange} placeholder="Ej. Módulo F" />
        </label>

        <label>
          Tipo
          <div className="relative w-full">
            <button
              type="button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="w-full flex items-center justify-between bg-slate-800 border border-slate-700 hover:border-slate-500 rounded-xl px-4 py-2.5 text-sm text-slate-200 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            >
              <span>{selectedType}</span>
              <svg className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isDropdownOpen && (
              <div className="absolute top-full left-0 w-full mt-2 z-[150] bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden py-1">
                {buildingTypes.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      handleTypeSelection(type);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                      selectedType === type
                        ? 'bg-indigo-600/20 text-indigo-300 font-medium'
                        : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            )}
          </div>
        </label>

        {/* Contenedor de botones (Fuerza ancho completo y espaciado) */}
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
            onClick={onSave}
            className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium transition-all shadow-md shadow-indigo-900/20 flex items-center justify-center"
          >
            Aplicar
          </button>

        </div>
      </section>
    </div>
  );
}