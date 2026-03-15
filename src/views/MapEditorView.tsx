import { useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useAuth } from '../context/useAuth';
import {
  fetchModularMapLayout,
  saveModularMapLayout,
} from '../features/campus-map/api/mapaAdmin';
import { BuildingLabelModal } from '../features/campus-map/components/BuildingLabelModal';
import { ModularMapCanvas } from '../features/campus-map/components/ModularMapCanvas';
import { ModularToolPalette } from '../features/campus-map/components/ModularToolPalette';
import { PoiConfigModal } from '../features/campus-map/components/PoiConfigModal';
import campusModularSeed from '../features/campus-map/data/campusModularSeed.json';
import {
  selectBuildingDraft,
  selectPoiDraft,
  useModularMapStore,
  type PoiDraft,
} from '../features/campus-map/editor/useModularMapStore';
import {
  clearRuntimeSeed,
  loadRuntimeSeed,
  saveRuntimeSeed,
} from '../features/campus-map/lib/runtimeSeed';
import type {
  BlockFootprint,
  GridCell,
  ModularMapSeed,
  PropKind,
} from '../features/campus-map/editor/modularMapTypes';
import './MapEditorView.css';

type DragPalettePayload =
  | { kind: 'area-block'; paletteId: string; footprint: BlockFootprint }
  | { kind: 'building-block'; paletteId: string; footprint: BlockFootprint }
  | { kind: 'prop'; propKind: PropKind };

const bundledSeed = campusModularSeed as ModularMapSeed;
const VIEW_MODE_STORAGE_KEY = 'cuceiverse.map.viewMode';

function getInitialViewMode(): 'isometric' | '2d' {
  if (typeof window === 'undefined') {
    return 'isometric';
  }
  const stored = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
  return stored === '2d' ? '2d' : 'isometric';
}

export function MapEditorView() {
  const modularSeed = useMemo(() => loadRuntimeSeed() ?? bundledSeed, []);
  const { isAdmin, token } = useAuth();

  const editorState = useModularMapStore(
    useShallow((state) => ({
      grid: state.grid,
      activeTool: state.activeTool,
      activePropKind: state.activePropKind,
      activeAreaPaletteId: state.activeAreaPaletteId,
      activeAreaFootprint: state.activeAreaFootprint,
      activeBuildingPaletteId: state.activeBuildingPaletteId,
      activeBuildingFootprint: state.activeBuildingFootprint,
      areaCellsByKey: state.areaCellsByKey,
      blocksById: state.blocksById,
      buildingsById: state.buildingsById,
      pathsByCell: state.pathsByCell,
      propsById: state.propsById,
      selection: state.selection,
      buildingModalTargetId: state.buildingModalTargetId,
    })),
  );

  const hydrateFromSeed = useModularMapStore((state) => state.hydrateFromSeed);
  const setActiveTool = useModularMapStore((state) => state.setActiveTool);
  const setActivePropKind = useModularMapStore((state) => state.setActivePropKind);
  const setActiveAreaPreset = useModularMapStore((state) => state.setActiveAreaPreset);
  const setActiveBuildingPreset = useModularMapStore((state) => state.setActiveBuildingPreset);
  const expandArea = useModularMapStore((state) => state.expandArea);
  const placeBuildingBlock = useModularMapStore((state) => state.placeBuildingBlock);
  const paintPathCell = useModularMapStore((state) => state.paintPathCell);
  const clearBrushStroke = useModularMapStore((state) => state.clearBrushStroke);
  const placeProp = useModularMapStore((state) => state.placeProp);
  const moveProp = useModularMapStore((state) => state.moveProp);
  const eraseAt = useModularMapStore((state) => state.eraseAt);
  const selectAt = useModularMapStore((state) => state.selectAt);
  const updateBuildingLabel = useModularMapStore((state) => state.updateBuildingLabel);
  const updatePropMetadata = useModularMapStore((state) => state.updatePropMetadata);
  const openBuildingLabelModal = useModularMapStore((state) => state.openBuildingLabelModal);
  const serializeForSave = useModularMapStore((state) => state.serializeForSave);

  const [buildingDraft, setBuildingDraft] = useState(() =>
    selectBuildingDraft(useModularMapStore.getState()),
  );
  const [poiDraft, setPoiDraft] = useState<PoiDraft | null>(() =>
    selectPoiDraft(useModularMapStore.getState()),
  );
  const [message, setMessage] = useState(
    'Arrastra bloques 2x2 o props al canvas.',
  );
  const [loadingLayout, setLoadingLayout] = useState(true);
  const [savingLayout, setSavingLayout] = useState(false);
  const [viewMode, setViewMode] = useState<'isometric' | '2d'>(getInitialViewMode);
  const [runtimeSeedSaved, setRuntimeSeedSaved] = useState(false);

  const payload = useMemo(
    () => serializeForSave(),
    [
      serializeForSave,
      editorState.blocksById,
      editorState.buildingsById,
      editorState.grid,
      editorState.areaCellsByKey,
      editorState.pathsByCell,
      editorState.propsById,
    ],
  );
  const payloadString = useMemo(() => JSON.stringify(payload, null, 2), [payload]);
  const lastSavedPayloadRef = useRef(payloadString);

  const isDirty = payloadString !== lastSavedPayloadRef.current;
  const buildingDraftFromStore = useModularMapStore(useShallow(selectBuildingDraft));
  const poiDraftFromStore = useModularMapStore(useShallow(selectPoiDraft));

  useEffect(() => {
    setBuildingDraft(buildingDraftFromStore);
  }, [buildingDraftFromStore]);

  useEffect(() => {
    setPoiDraft(poiDraftFromStore);
  }, [poiDraftFromStore]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
  }, [viewMode]);

  useEffect(() => {
    if (!token) {
      setLoadingLayout(false);
      return;
    }

    let cancelled = false;
    setLoadingLayout(true);

    fetchModularMapLayout(token, modularSeed.mapId)
      .then((response) => {
        if (cancelled) {
          return;
        }
        hydrateFromSeed(response.data);
        const nextPayload = JSON.stringify(response.data, null, 2);
        lastSavedPayloadRef.current = nextPayload;
        setMessage(`Layout modular cargado desde backend (${response.meta.savedAt}).`);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        hydrateFromSeed(modularSeed);
        const nextPayload = JSON.stringify(modularSeed, null, 2);
        lastSavedPayloadRef.current = nextPayload;
        setMessage('No se encontró layout remoto; se cargó el seed local.');
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingLayout(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hydrateFromSeed, token]);

  const handleDropPaletteItem = (dragPayload: DragPalettePayload, cell: GridCell) => {
    if (dragPayload.kind === 'area-block') {
      const result = expandArea(cell, dragPayload.paletteId, dragPayload.footprint);
      setMessage(
        result.ok
          ? `Area expandida con bloque ${dragPayload.footprint.width}x${dragPayload.footprint.height}.`
          : result.reason ?? 'No se pudo expandir el area.',
      );
      return;
    }

    if (dragPayload.kind === 'building-block') {
      const result = placeBuildingBlock(cell, dragPayload.paletteId, dragPayload.footprint);
      setMessage(
        result.ok
          ? `Bloque ${dragPayload.footprint.width}x${dragPayload.footprint.height} colocado y fusionado si tocó otro borde.`
          : result.reason ?? 'No se pudo colocar el bloque.',
      );
      return;
    }

    const result = placeProp(cell, dragPayload.propKind);
    if (result.ok && dragPayload.propKind === 'poi' && result.propId) {
      const store = useModularMapStore.getState();
      setPoiDraft(selectPoiDraft(store));
    }
    setMessage(
      result.ok
        ? `Prop ${dragPayload.propKind} colocado.`
        : result.reason ?? 'No se pudo colocar el prop.',
    );
  };

  const handlePathBrushStart = (cell: GridCell) => {
    const result = paintPathCell(cell);
    if (!result.ok && result.reason) {
      setMessage(result.reason);
    }
  };

  const handlePathBrushMove = (cell: GridCell) => {
    void paintPathCell(cell);
  };

  const handleSave = async () => {
    if (!token) {
      setMessage('No hay token de autenticación para guardar el layout modular.');
      return;
    }

    setSavingLayout(true);
    try {
      const response = await saveModularMapLayout(token, payload);
      const nextPayload = JSON.stringify(response.data, null, 2);
      lastSavedPayloadRef.current = nextPayload;
      setMessage(
        `Layout modular guardado: ${response.data.buildings.length} edificios, ${response.data.paths.length} pasillos y ${response.data.props.length} props.`,
      );
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar el layout modular.');
    } finally {
      setSavingLayout(false);
    }
  };

  const handleReset = () => {
    hydrateFromSeed(modularSeed);
    const resetPayload = JSON.stringify(
      useModularMapStore.getState().serializeForSave(),
      null,
      2,
    );
    lastSavedPayloadRef.current = resetPayload;
    setBuildingDraft(null);
    setMessage('Estado restaurado desde el seed modular base.');
  };

  const handleSetRuntimeSeed = () => {
    const current = useModularMapStore.getState().serializeForSave();
    saveRuntimeSeed(current);
    setRuntimeSeedSaved(true);
    setMessage('Semilla activa actualizada: este mapa se usará como fallback automáticamente.');
    setTimeout(() => setRuntimeSeedSaved(false), 3000);
  };

  const handleClearRuntimeSeed = () => {
    clearRuntimeSeed();
    setMessage('Semilla activa eliminada. Se usará el campusModularSeed incluido en el build.');
  };

  const handleMoveProp = (id: string, cell: GridCell) => {
    const result = moveProp(id, cell);
    if (!result.ok && result.reason) {
      setMessage(result.reason);
    }
  };

  const handleSelect = (cell: GridCell) => {
    selectAt(cell);
    const store = useModularMapStore.getState();
    const nextBuildingDraft = selectBuildingDraft(store);
    const nextPoiDraft = selectPoiDraft(store);
    setBuildingDraft(nextBuildingDraft);
    setPoiDraft(nextPoiDraft);
    if (nextBuildingDraft) {
      setMessage(`Editando etiqueta global de ${nextBuildingDraft.id}.`);
      return;
    }
    if (nextPoiDraft) {
      setMessage(`Editando POI ${nextPoiDraft.id}.`);
    }
  };

  const handlePlaceBuildingBlock = (cell: GridCell) => {
    if (editorState.activeTool === 'area-block') {
      const result = expandArea(cell);
      setMessage(result.ok ? 'Area verde ampliada.' : result.reason ?? 'No se pudo expandir el area.');
      return;
    }

    const result = placeBuildingBlock(cell);
    setMessage(
      result.ok
        ? result.createdNewBuilding
          ? 'Edificio nuevo creado. Ajusta etiqueta y tipo en el modal.'
          : 'Bloque agregado a edificio existente.'
        : result.reason ?? 'No se pudo colocar el bloque.',
    );
  };

  const handlePlaceProp = (cell: GridCell) => {
    const result = placeProp(cell);
    if (result.ok && editorState.activePropKind === 'poi' && result.propId) {
      const store = useModularMapStore.getState();
      setPoiDraft(selectPoiDraft(store));
    }
    setMessage(
      result.ok
        ? `Prop ${editorState.activePropKind} colocado.`
        : result.reason ?? 'No se pudo colocar el prop.',
    );
  };

  const handleErase = (cell: GridCell) => {
    eraseAt(cell);
  };

  const handleEraseEnd = () => {
    setMessage('Borrado continuo aplicado.');
  };

  const handleApplyBuildingLabel = () => {
    if (!buildingDraft) {
      return;
    }
    updateBuildingLabel(buildingDraft);
    setMessage(`Etiqueta global actualizada para ${buildingDraft.name}.`);
    setBuildingDraft(null);
  };

  const handleApplyPoiConfig = (draft: PoiDraft) => {
    const result = updatePropMetadata(draft.id, {
      label: draft.label,
      interestRadius: String(draft.interestRadius),
      areaCodigo: 'POI_INTERES',
    });
    if (result.ok) {
      setMessage(`POI ${draft.id} actualizado con area de interés.`);
    } else if (result.reason) {
      setMessage(result.reason);
    }
    setPoiDraft(null);
  };

  if (!isAdmin) {
    return (
      <section className="map-editor-view">
        <div className="map-editor-alert">
          No tienes permisos de administrador para el modo edición.
        </div>
      </section>
    );
  }

  return (
    <section className="map-editor-view--modular flex-1 relative w-full overflow-hidden">
      <div className="map-editor-fullbleed-root absolute inset-0 z-0 overflow-hidden bg-slate-900">
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-[200] flex items-center h-10 px-4 bg-slate-900/90 backdrop-blur-xl rounded-full border border-slate-700 shadow-2xl shadow-amber-500/10 pointer-events-none whitespace-nowrap">
          <div className="flex items-center gap-2 h-full">
            <span
              className="inline-flex items-center justify-center text-amber-300 drop-shadow-[0_0_6px_rgba(251,191,36,0.45)]"
              aria-hidden="true"
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
                <path d="M3 3h7v7H3zM5 5v3h3V5zM11 10l2-2 1 1-2 2 2 2-1 1-2-2-2 2-1-1 2-2-2-2 1-1zM2 12h6v6H2zM4 14v2h2v-2z" />
              </svg>
            </span>
            <span
              className="text-xs font-bold tracking-widest text-white uppercase m-0 p-0 leading-none"
              style={{ fontFamily: 'Fira Code, monospace', textShadow: 'none', WebkitTextStroke: '0' }}
            >
              EDICIÓN MODULAR
            </span>
          </div>

          <div className="w-[1px] h-5 bg-slate-700 mx-3" aria-hidden="true"></div>

          <div className="flex items-center gap-2 h-full pointer-events-auto">
            <button
              type="button"
              onClick={() => setViewMode('isometric')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-colors ${viewMode === 'isometric' ? 'border-slate-300/90 bg-slate-200/95 text-slate-900' : 'bg-slate-800/80 border-slate-700/80 text-slate-300 hover:bg-slate-700/80'}`}
              aria-pressed={viewMode === 'isometric'}
            >
              <svg viewBox="0 0 20 20" className="h-3 w-3" fill="currentColor" aria-hidden="true">
                <path d="M10 2l6 3.5v7L10 16l-6-3.5v-7L10 2zm0 2.2L6 6.4v4.8l4 2.2 4-2.2V6.4L10 4.2z" />
              </svg>
              <span className="text-[10px] font-bold tracking-wider uppercase leading-none">ISOMÉTRICO</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('2d')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full transition-colors ${viewMode === '2d' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' : 'bg-slate-800/80 border border-slate-700/80 text-slate-300 hover:bg-slate-700/80'}`}
              aria-pressed={viewMode === '2d'}
            >
              <svg viewBox="0 0 20 20" className="h-3 w-3" fill="currentColor" aria-hidden="true">
                <path d="M3 4h14v3H3zM5 9h10v3H5zM7 14h6v3H7z" />
              </svg>
              <span className="text-[10px] font-black tracking-widest uppercase leading-none">2D</span>
            </button>

            <button
              type="button"
              onClick={handleSetRuntimeSeed}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-700 text-white hover:bg-emerald-600 transition-colors"
              title="Guardar mapa actual como semilla activa (sin editar código)"
            >
              <span className="text-[10px] font-black tracking-widest uppercase leading-none">
                {runtimeSeedSaved ? 'SEMILLA OK' : 'FIJAR SEMILLA'}
              </span>
            </button>

            <button
              type="button"
              onClick={handleClearRuntimeSeed}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-700 text-slate-100 hover:bg-slate-600 transition-colors"
              title="Volver a la semilla incluida en el proyecto"
            >
              <span className="text-[10px] font-black tracking-widest uppercase leading-none">LIMPIAR SEMILLA</span>
            </button>
          </div>
        </div>

        <div className="map-editor-canvas-layer absolute inset-0 z-0">
          <ModularMapCanvas
            editorState={editorState}
            onDropPaletteItem={handleDropPaletteItem}
            onPathBrushStart={handlePathBrushStart}
            onPathBrushMove={handlePathBrushMove}
            onPathBrushEnd={clearBrushStroke}
            onErase={handleErase}
            onEraseEnd={handleEraseEnd}
            onSelect={handleSelect}
            onMoveProp={handleMoveProp}
            onPlaceBuildingBlock={handlePlaceBuildingBlock}
            onPlaceProp={handlePlaceProp}
            viewMode={viewMode}
          />
        </div>

        <div className="map-editor-overlay-left w-80 max-h-[calc(100vh-80px)] overflow-y-auto overflow-x-hidden flex flex-col gap-4">
          <div className="bg-slate-900/95 backdrop-blur-sm rounded-xl border border-slate-700 shadow-2xl p-2">
          <ModularToolPalette
            layout="horizontal"
            variant="tools-only"
            activeTool={editorState.activeTool}
            activePropKind={editorState.activePropKind}
            activeAreaPaletteId={editorState.activeAreaPaletteId}
            activeBuildingPaletteId={editorState.activeBuildingPaletteId}
            buildingCount={Object.keys(editorState.buildingsById).length}
            pathCount={Object.keys(editorState.pathsByCell).length}
            propCount={Object.keys(editorState.propsById).length}
            isDirty={isDirty}
            onToolChange={setActiveTool}
            onPropKindChange={setActivePropKind}
            onAreaPresetChange={setActiveAreaPreset}
            onBuildingPresetChange={setActiveBuildingPreset}
            onSave={handleSave}
            onReset={handleReset}
          />
          </div>

          <div className="bg-slate-900/95 backdrop-blur-sm rounded-xl border border-slate-700 shadow-2xl p-2">
          <ModularToolPalette
            layout="vertical"
            variant="content-no-props"
            activeTool={editorState.activeTool}
            activePropKind={editorState.activePropKind}
            activeAreaPaletteId={editorState.activeAreaPaletteId}
            activeBuildingPaletteId={editorState.activeBuildingPaletteId}
            buildingCount={Object.keys(editorState.buildingsById).length}
            pathCount={Object.keys(editorState.pathsByCell).length}
            propCount={Object.keys(editorState.propsById).length}
            isDirty={isDirty}
            onToolChange={setActiveTool}
            onPropKindChange={setActivePropKind}
            onAreaPresetChange={setActiveAreaPreset}
            onBuildingPresetChange={setActiveBuildingPreset}
            onSave={handleSave}
            onReset={handleReset}
          />
          </div>
        </div>

        <div className="absolute bottom-4 left-[350px] right-4 z-50 pointer-events-auto bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col props-toolbar-carousel">
          <div className="px-4 py-2 border-b border-slate-800 shrink-0">
            <h3 className="text-sm font-bold text-white">Props</h3>
          </div>

          <div className="flex flex-row overflow-x-auto gap-3 p-3 custom-scrollbar">
            <ModularToolPalette
              layout="horizontal"
              variant="props-only"
              activeTool={editorState.activeTool}
              activePropKind={editorState.activePropKind}
              activeAreaPaletteId={editorState.activeAreaPaletteId}
              activeBuildingPaletteId={editorState.activeBuildingPaletteId}
              buildingCount={Object.keys(editorState.buildingsById).length}
              pathCount={Object.keys(editorState.pathsByCell).length}
              propCount={Object.keys(editorState.propsById).length}
              isDirty={isDirty}
              onToolChange={setActiveTool}
              onPropKindChange={setActivePropKind}
              onAreaPresetChange={setActiveAreaPreset}
              onBuildingPresetChange={setActiveBuildingPreset}
              onSave={handleSave}
              onReset={handleReset}
            />
          </div>
        </div>

        <div className="map-editor-overlay-status bg-slate-900/95 backdrop-blur-sm rounded-xl border border-slate-700 shadow-2xl">
          <div className="map-editor-statusbar">
            <span>
              {loadingLayout
                ? 'Cargando layout modular...'
                : savingLayout
                  ? 'Guardando layout modular...'
                  : message}
            </span>
            <span>
              {isDirty ? 'Cambios pendientes de exportar' : 'Sin cambios pendientes'}
            </span>
          </div>
        </div>
      </div>

      <BuildingLabelModal
        draft={buildingDraft}
        onChange={setBuildingDraft}
        onClose={() => {
          openBuildingLabelModal(null);
          setBuildingDraft(null);
        }}
        onSave={handleApplyBuildingLabel}
      />

      <PoiConfigModal
        draft={poiDraft}
        onClose={() => setPoiDraft(null)}
        onSave={handleApplyPoiConfig}
      />
    </section>
  );
}
