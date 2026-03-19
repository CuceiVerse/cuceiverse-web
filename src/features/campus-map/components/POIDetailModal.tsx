import type { PuntoInteres } from '../types';

type POIDetailModalProps = {
  poi: PuntoInteres | null;
  onClose: () => void;
  onSimulateRoute: (poi: PuntoInteres) => void;
};

export function POIDetailModal({
  poi,
  onClose,
  onSimulateRoute,
}: POIDetailModalProps) {
  return (
    <aside className={`poi-detail-panel ${poi ? 'open' : ''}`}>
      <div className="poi-detail-header">
        <div>
          <p className="poi-detail-eyebrow">Punto de interes</p>
          <h3>{poi?.nombre ?? 'Selecciona un marcador'}</h3>
        </div>
        <button type="button" className="poi-close-btn" onClick={onClose}>
          Cerrar
        </button>
      </div>

      {poi ? (
        <>
          <div className="poi-detail-card">
            <span className="poi-chip">{poi.tipo}</span>
            <span className="poi-chip muted">
              {poi.edificioReferencia ?? 'Sin edificio'}
            </span>
          </div>

          <p className="poi-detail-description">
            {poi.descripcion ??
              'Este punto aun no tiene descripcion. El backend ya expone la estructura para enriquecerlo.'}
          </p>

          <dl className="poi-detail-metadata">
            <div>
              <dt>Grid X</dt>
              <dd>{poi.coordenadaXGrid}</dd>
            </div>
            <div>
              <dt>Grid Y</dt>
              <dd>{poi.coordenadaYGrid}</dd>
            </div>
            <div>
              <dt>Prioridad visual</dt>
              <dd>{poi.prioridadVisual}</dd>
            </div>
            <div>
              <dt>Estado</dt>
              <dd>{poi.activo ? 'Activo' : 'Inactivo'}</dd>
            </div>
          </dl>

          <div className="poi-detail-actions">
            <button
              type="button"
              className="primary"
              onClick={() => onSimulateRoute(poi)}
            >
              Simular ruta
            </button>
            <button type="button" disabled>
              Ver horarios
            </button>
            <button type="button" disabled>
              Integrar IA contextual
            </button>
          </div>
        </>
      ) : (
        <p className="poi-empty-state">
          Haz clic sobre un marcador para abrir su contexto, simular una ruta y
          preparar acciones futuras del MVP.
        </p>
      )}
    </aside>
  );
}