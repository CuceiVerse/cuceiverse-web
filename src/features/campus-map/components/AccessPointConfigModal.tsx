import { useEffect, useMemo, useState } from 'react';

import type { MapProp, ModularBuilding } from '../editor/modularMapTypes';

export type AccessPointDraft = {
    id: string;
    targetKind: '' | 'building' | 'prop';
    targetId: string;
};

type Props = {
    draft: AccessPointDraft | null;
    buildings: ModularBuilding[];
    placeProps: Array<Pick<MapProp, 'id' | 'kind' | 'metadata'>>;
    onClose: () => void;
    onSave: (draft: AccessPointDraft) => void;
};

function labelForPlaceProp(prop: Pick<MapProp, 'id' | 'kind' | 'metadata'>): string {
    const label = prop.metadata?.label?.trim();
    if (label) return label;
    return `${prop.kind} — ${prop.id}`;
}

export function AccessPointConfigModal({ draft, buildings, placeProps, onClose, onSave }: Props) {
    const [targetKind, setTargetKind] = useState<AccessPointDraft['targetKind']>('');
    const [targetId, setTargetId] = useState('');

    useEffect(() => {
        if (!draft) {
            return;
        }
        setTargetKind(draft.targetKind);
        setTargetId(draft.targetId);
    }, [draft]);

    const sortedBuildings = useMemo(() => {
        return [...buildings].sort((a, b) => a.name.localeCompare(b.name));
    }, [buildings]);

    const sortedPlaceProps = useMemo(() => {
        return [...placeProps].sort((a, b) => labelForPlaceProp(a).localeCompare(labelForPlaceProp(b)));
    }, [placeProps]);

    if (!draft) {
        return null;
    }

    const hasTargets = sortedBuildings.length > 0 || sortedPlaceProps.length > 0;

    return (
        <div className="building-modal-backdrop" role="presentation" onClick={onClose}>
            <section className="building-modal glass-panel" onClick={(event) => event.stopPropagation()}>
                <p className="building-modal__eyebrow">Punto de acceso</p>
                <h3>{draft.id}</h3>

                <p className="text-sm text-slate-400">
                    Asigna este acceso a un edificio o lugar para que las rutas terminen aquí.
                </p>

                {!hasTargets ? (
                    <p className="mt-3 text-sm text-rose-300">No hay edificios ni lugares para asignar.</p>
                ) : null}

                <label>
                    Tipo de destino
                    <select
                        value={targetKind}
                        onChange={(event) => {
                            const next = event.target.value as AccessPointDraft['targetKind'];
                            setTargetKind(next);
                            setTargetId('');
                        }}
                    >
                        <option value="">Sin asignar</option>
                        <option value="building" disabled={sortedBuildings.length === 0}>
                            Edificio
                        </option>
                        <option value="prop" disabled={sortedPlaceProps.length === 0}>
                            Lugar (POI del mapa)
                        </option>
                    </select>
                </label>

                {targetKind === 'building' ? (
                    <label>
                        Edificio
                        <select value={targetId} onChange={(event) => setTargetId(event.target.value)}>
                            <option value="">Selecciona...</option>
                            {sortedBuildings.map((building) => (
                                <option key={building.id} value={building.id}>
                                    {building.name || building.id}
                                </option>
                            ))}
                        </select>
                    </label>
                ) : null}

                {targetKind === 'prop' ? (
                    <label>
                        Lugar
                        <select value={targetId} onChange={(event) => setTargetId(event.target.value)}>
                            <option value="">Selecciona...</option>
                            {sortedPlaceProps.map((prop) => (
                                <option key={prop.id} value={prop.id}>
                                    {labelForPlaceProp(prop)}
                                </option>
                            ))}
                        </select>
                    </label>
                ) : null}

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
                        onClick={() =>
                            onSave({
                                id: draft.id,
                                targetKind,
                                targetId: targetKind ? targetId.trim() : '',
                            })
                        }
                        className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium transition-all shadow-md shadow-indigo-900/20 flex items-center justify-center"
                    >
                        Aplicar
                    </button>
                </div>
            </section>
        </div>
    );
}
