import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import {
  ClipboardCheck,
  Search,
  BookOpen,
  Clock,
  MapPin,
  X,
  FileText,
  AlertTriangle,
  Banknote,
  Globe,
  Building2
} from 'lucide-react';
import { usePerfViewLoadEnd } from '../lib/usePerfViewLoadEnd';
import './TramitesView.css';

interface Tramite {
  id: string;
  title: string;
  description: string;
  category: string;
  time: string;
  cost: string;
  location: string;
  requirements: string[];
  externalUrl?: string;
}

const TRAMITE_CATEGORIES = ['Todas', 'Constancias', 'Revalidación', 'Bajas', 'Académico', 'Titulación', 'Aclaraciones', 'Servicios'];

const TRAMITES_DATA: Tramite[] = [
  // CONSTANCIAS Y CERTIFICADOS
  {
    id: '1', title: 'Copia certificada de acta de nacimiento',
    description: 'En caso de que en el archivo de Control Escolar se encuentre tu Acta de Nacimiento, se te puede entregar una copia certificada de ésta.',
    category: 'Constancias', time: '3 días hábiles', cost: '$ 91.00', location: 'Control Escolar (Modulo A, Proulex)',
    requirements: ['Solicitar a través de la página oficial de SIATSE.', 'Presentarse físicamente y recoger en la ventanilla de Control Escolar (Módulo A, Proulex).']
  },
  {
    id: '2', title: 'Copia certificada del certificado de preparatoria',
    description: 'En caso de que en el archivo de Control Escolar se encuentre tu Certificado de Preparatoria, se te puede entregar una copia certificada de éste.',
    category: 'Constancias', time: '3 días hábiles', cost: '$ 91.00', location: 'Control Escolar (Modulo A, Proulex)',
    requirements: ['Solicitar a través de la página oficial de SIATSE.', 'Presentarse físicamente y recoger en la ventanilla de Control Escolar (Módulo A, Proulex).']
  },
  {
    id: '3', title: 'Copia dictamen de acreditación',
    description: 'Solo en caso de que ya tengas un trámite de Acreditación finalizado, puedes solicitar copia del dictamen emitido por la Comisión de Acreditación y Revalidación de Estudios.',
    category: 'Constancias', time: '3 días hábiles', cost: '$ 91.00', location: 'Control Escolar (Modulo A, Proulex)',
    requirements: ['Tener concluido un trámite formal de Acreditación.', 'Solicitar el dictamen a través de la plataforma SIATSE.']
  },
  {
    id: '4', title: 'Constancia con calificaciones',
    description: 'Documento que muestra las materias cursadas y aprobadas con calificación, créditos obtenidos, el ciclo cursado y  el promedio obtenido hasta la emisión.',
    category: 'Constancias', time: '3 días hábiles', cost: '$ 63.00', location: 'Control Escolar (Modulo A, Proulex)',
    requirements: ['Solicitar directamente en el portal de SIATSE.', 'Recoger el documento en ventanilla de Control Escolar con tu comprobante.']
  },
  {
    id: '5', title: 'Constancia con Horario',
    description: 'Documento que indica las materias, horarios y periodo del ciclo escolar del alumno.',
    category: 'Constancias', time: '1 día hábil', cost: '$ 39.00', location: 'Control Escolar (Modulo A, Proulex)',
    requirements: ['Registrar solicitud en SIATSE.', 'Recibir o recoger el documento en ventanilla obligatoriamente después de las 13:00 hrs.']
  },
  {
    id: '6', title: 'Constancia de Ficha Tecnica',
    description: 'Refleja de forma oficial el promedio general, promedio por ciclo escolar y el total de créditos obtenidos a la fecha.',
    category: 'Constancias', time: '1 día hábil', cost: '$ 39.00', location: 'Control Escolar (Modulo A, Proulex)',
    requirements: ['Registrar solicitud en SIATSE.', 'Recibir o recoger el documento en ventanilla obligatoriamente después de las 13:00 hrs.']
  },
  {
    id: '7', title: 'Constancia para beca',
    description: 'Comprueba estado de alumno de licenciatura, muestra promedio total, promedio del semestre inmediato anterior, número de créditos y ciclo en curso.',
    category: 'Constancias', time: '1 día hábil', cost: '$ 39.00', location: 'Control Escolar (Modulo A, Proulex)',
    requirements: ['Registrar solicitud en SIATSE indicando uso para beca.', 'Recoger emitido el documento después de las 13:00 hrs.']
  },
  {
    id: '8', title: 'Constancia sin Calificaciones',
    description: 'Documento que menciona solo que eres alumno de la licenciatura, el inicio y termino del calendario vigente.',
    category: 'Constancias', time: '1 día hábil', cost: '$ 39.00', location: 'Control Escolar (Modulo A, Proulex)',
    requirements: ['Registrar solicitud en SIATSE.', 'Acudir a reclamar el documento después de las 13:00 hrs.']
  },
  {
    id: '9', title: 'Kardex Certificado',
    description: 'Kardex oficial certificado por el Coordinador de Control Escolar (muestra materias, créditos, promedios e inicio/fin del calendario).',
    category: 'Constancias', time: '1 día hábil', cost: '$ 39.00', location: 'Control Escolar (Modulo A, Proulex)',
    requirements: ['Registrar solicitud en SIATSE.', 'Recoger el documento físico apostillado localmente después de las 13:00 hrs.']
  },

  // ACREDITACIÓN Y REVALIDACIÓN
  {
    id: '10', title: 'Acreditación de materias (CUCEI o Incorporadas)',
    description: 'Acreditación de materias para escuelas originarias de UDG o debidamente incorporadas.',
    category: 'Revalidación', time: 'Revisa el Calendario de Actividades Escolares', cost: '$ 68.00 por materia', location: 'Plataforma SIATSE / Control Escolar (Modulo A, Proulex)',
    requirements: [
      'Esperar a ser formalmente admitido y estar en calendario de actividades.',
      'Ingresar a SIATCE -> Trámites Varios -> "Acreditación y Revalidación" y seguir ruta.',
      'Si es de UDG: Entregar Solicitud SIATCE, Kardex, y Certificado en orginal y copia.',
      'Si es Incorporada: Entregar Solicitud SIATCE (orig/cop), Oficio Igualdad (orig), Kardex (orig), Certificado y Programas de Materia en original.',
      'Si es Posgrado: Anexar Dictamen de la Junta Académica (original y copia).'
    ]
  },
  {
    id: '11', title: 'Revalidación de materias (Extranjero)',
    description: 'Revalidación de materias cursadas en universidades fuera del país.',
    category: 'Revalidación', time: 'Revisa el Calendario de Actividades Escolares', cost: '$ 513.00 por materia', location: 'Plataforma SIATSE / Control Escolar (Modulo A, Proulex)',
    requirements: [
      'Ingresar a SIATCE -> Trámites Varios -> "Acreditación y Revalidación".',
      'Entregar Original y 2 copias de la Solicitud SIATCE y del Oficio de Igualdad del Coordinador.',
      'Entregar Kardex/Constancia (orig y copia) junto a Certificado y Programas.',
      'Es obligatorio que el Certificado y los Programas vengan APOSTILLADOS.',
      'Para idiomas de habla no hispana, incluir Traducción Oficial del certificado y programas.'
    ]
  },
  {
    id: '12', title: 'Equivalencia de materias (Nacional)',
    description: 'Acreditar materias cursadas en otras escuelas y universidades mexicanas que no son de UDG.',
    category: 'Revalidación', time: 'Revisa el Calendario de Actividades Escolares', cost: '$ 113.00 por materia', location: 'Plataforma SIATSE / Control Escolar (Modulo A, Proulex)',
    requirements: [
      'Ingresar a SIATCE -> Trámites Varios -> "Acreditación y Revalidación".',
      'Entregar Original y 2 copias de la Solicitud SIATCE y Oficio del Coordinador.',
      'Entregar Kardex o Constancia con calificaciones (Original y Copia).',
      'Entregar Certificado Parcial o Total y Programas de Materia totalmente Originales.'
    ]
  },

  // BAJAS Y REINGRESOS 
  {
    id: '13', title: 'Baja de materias por artículo 8vo.',
    description: 'Exclusivamente para dar de baja materias de área optativa abierta que estén en el plan.',
    category: 'Bajas', time: '5 días hábiles al cerrar', cost: 'Sin Costo', location: 'Plataforma SIATSE',
    requirements: [
      'Tener el ciclo actual totalmente pagado.',
      'Realizar OBLIGATORIAMENTE la semana anterior a la captura de calificación ordinaria.',
      'Iniciar sesión en SIATCE y solicitar en "Trámites varios" la baja por artículo 8vo.',
      'Ojo: SOLO SE PUEDE REALIZAR 1 VEZ EN TODA TU CARRERA.'
    ]
  },
  {
    id: '14', title: 'Solicitud para reingresar',
    description: 'Solicitud de reingreso al centro universitario posterior a una inactividad o separación de estudios.',
    category: 'Bajas', time: '1 día hábil', cost: 'Depende de adeudo en SIIAU', location: 'Plataforma SIATSE',
    requirements: [
      'Pagar previamente todos tus adeudos con la UDG (Revisar en SIIAU).',
      'Ingresar cuenta en SIATCE con código y NIP.',
      'Solicitar trámite "Reingreso" dentro de la sección de Trámites varios.',
      'Consultar la respuesta directamente en la plataforma.'
    ]
  },
  {
    id: '15', title: 'Examen de acreditación por competencias',
    description: 'Permite acreditar una materia demostrando habilidades teóricas o prácticas evaluables por el departamento.',
    category: 'Académico', time: '3 días hábiles', cost: '$ 1,086.00 por materia', location: 'Departamento correspondiente',
    requirements: [
      'Realizar la solicitud inicial directamente en el Departamento correspondiente.',
      'Esperar la evaluación y obtener la autorización explícita.',
      'Presentar la autorización en ventanilla de Control Escolar (Módulo A) para elaboración de orden de pago.'
    ]
  },
  {
    id: '16', title: 'Solicitud de baja voluntaria y retiro de documentos',
    description: 'Baja total definitiva de tus estudios actuales en CUCEI y retiro de la documentación base personal de los archivos.',
    category: 'Bajas', time: 'Docs: Inmediato / SIIAU: 3 días', cost: '$ 10.00', location: 'Ventanilla Archivo (Modulo A, Proulex) / Plataforma SIATSE',
    requirements: [
      'Iniciar sesión en la cuenta de SIATCE y seleccionar "Tramites Disponibles".',
      'Consultar requisitos finales en la solicitud de baja.',
      'Imprimir el formato general, realizar el pago y entregar en la ventanilla de archivo.'
    ]
  },

  // TITULACIÓN Y DOCUMENTOS OFICIALES
  {
    id: '17', title: 'Certificación de planes y programas de estudios',
    description: 'Certificar los planes específicos cursados durante la trayectoria escolar. Ocupado generalmente para apostillado por el Gobierno.',
    category: 'Titulación', time: 'Variable por alumno', cost: 'Costo pendiente. Validado en archivo', location: 'Secretaría Académica / Control Escolar General',
    requirements: [
      'Obtener copias de planes de estudio debidamente avalados (Coordinador y Secretario de División).',
      'Solicitar en Secretaría Académica el oficio formal de certificación con los avales en mano.',
      'Acudir al archivo de Coordinación de Control Escolar del CUCEI para la orden de pago del arancel.',
      'Tras pagar, liquidar presentando los doctos en Coordinación de Control Escolar General (Av. Juárez piso -1).',
      'Opcional: Si se ocupa legalizar por Gobierno del Estado ir a Prolongación Alcalde #1855.'
    ]
  },
  {
    id: '18', title: 'Acta de Titulación',
    description: 'Adquisición de copias certificadas del acta formal de titulación y grado escolar. Indispensable estatus Graduado.',
    category: 'Titulación', time: '5 días hábiles en Módulo A', cost: '$ 91.00', location: 'Ventanilla Egresados',
    requirements: [
      'Verificar tener estatus obligatorio de "Graduado" en sistema.',
      'Realizar e iniciar trámite en SIATCE, en la zona de "Copias Certificadas".',
      'Presentarse físicamente a ventanilla de Egresados (Módulo A) con el comprobante SIATCE impreso.',
      'Mostar una Identificación Oficial con fotografía vigente.'
    ]
  },
  {
    id: '19', title: 'Copia certificada de certificado de bachillerato',
    description: 'Solicita documentos y constancias de tu expediente cerrado correspondiente a la etapa de media superior.',
    category: 'Titulación', time: '3 días hábiles en Archivo', cost: '$ 91.00', location: 'Ventanilla Archivo (Módulo A)',
    requirements: [
      'Iniciar el trámite desde la cuenta SIATCE, bajo la sección de "Copias Certificadas".',
      'Acudir de forma presencial a la ventanilla de archivo en Control Escolar.',
      'Presentar el comprobante de tramite impreso y una identificación oficial vigente.'
    ]
  },
  {
    id: '20', title: 'Constancia de no adeudo a la Universidad',
    description: 'Documento acreditativo de que el estudiante no posee deudas académicas, administrativas, financieras ni de biblioteca con la UDG.',
    category: 'Titulación', time: '3 días hábiles a tu correo', cost: 'Dependiendo de deuda', location: 'Ventanilla Egresados (Módulo A)',
    requirements: [
      'Solicitar y presentarse en la ventanilla de Egresados (Modulo A, Proulex).',
      'Presentar de forma física COMPROBANTE ACADÉMICO original.',
      'Presentar carta/comprobante de término de SERVICIO SOCIAL (Original).'
    ]
  },

  // LICENCIAS Y ARTICULOS
  {
    id: '21', title: 'Formato para validación de estudios',
    description: 'Formulario oficial para ser llenado por instituciones de procedencia buscando reconocer y validar créditos.',
    category: 'Académico', time: 'Inmediato (Formato Libre)', cost: 'Sin Costo', location: 'Ventanilla Archivo (Modulo A, Proulex)',
    externalUrl: 'https://escolar.cucei.udg.mx/cescolar/docs/validacion.pdf',
    requirements: [
      'Comunicarse directamente con la escuela de procedencia foránea para obtener datos precisos.',
      'Descargar oficialmente el PDF del formato provisto en la sección de opciones abajo.',
      'Imprimir, rellenar los datos completos y entregar en la ventanilla principal de archivo.'
    ]
  },
  {
    id: '22', title: 'Solicitud de licencia (Excepto posgrados)',
    description: 'Pausa estudiantil o suspensión parcial para conservación oficial de derechos educativos y no perder dictamen.',
    category: 'Académico', time: '5 días hábiles (Consulta SIATCE)', cost: 'Sin Costo', location: 'Plataforma SIATSE',
    requirements: [
      'Estrictamente realizar la solicitud solo en las fechas designadas en Calendario de Actividades del ciclo.',
      'No presentar ningún adeudo de matrícula monetario en el sistema central.',
      'No mantener ninguna materia en estado de REPROBADA.',
      'Ingresar a SIATCE -> botón "Trámites disponibles" -> "Solicitud de Licencia".',
      'Nota: El trámite para Posgrados no obedece a esto; debe tratarse con su coordinador local.'
    ]
  },
  {
    id: '23', title: 'Solicitud de Oportunidad por incurrir en Art. 33',
    description: 'Mecanismo de excepción legal o prórroga administrativa otorgada a estudiantes en estatus de artículo por fallar materias.',
    category: 'Aclaraciones', time: 'Revisión en 3 semanas aprox.', cost: 'Sin Costo', location: 'Plataforma SIATSE',
    requirements: [
      'Realizar primeramente en SIIAU el pago en ceros de cualquier adeudo general pendiente.',
      'Cerciorarse que la acción se comete en los tiempos que abarca el calendario de actividades vigentes.',
      'Ingresar a sesión normal del SIATCE.',
      'Presionar en "Trámites disponibles" y buscar la forma de "Solicitud de oportunidad".',
      'El estatus de resolución varía con máximo límite de corte: 31 Jul (Calendario A) y 16 Ene (Calendario B).'
    ]
  },
  {
    id: '24', title: 'Trámite de alta en IMSS como estudiante',
    description: 'Proceso de incorporación obligatoria de salud médica social provista de forma facultativa por ser matriculado en curso.',
    category: 'Servicios', time: 'Inmediata directamente por portal', cost: 'Sin Costo', location: 'Plataforma SIATSE',
    requirements: [
      'Ingresar a la plataforma del SIATSE y encontrar dicho trámite.',
      'Leer, guardar o imprimir el archivo Anexo descriptivo en el propio espacio de Trámite del SIATSE.',
      'Seguir meticulosamente los pequeños pasos de navegación a sistema nacional que describe el Anexo.'
    ]
  },
  {
    id: '25', title: '¿Por qué tengo artículo 34 si ya pasé la materia?',
    description: 'Proceso de clarificación para errores o intermitencias en bases de datos donde una materia aprobada figura de baja o en Art. 34.',
    category: 'Aclaraciones', time: 'Evaluación rápida de 1 día hábil', cost: 'Sin Costo', location: 'Plataforma SIATSE / Ficha Técnica',
    requirements: [
      'Consultar como primer paso tu FICHA TÉCNICA original en SIIAU y constatar tus fechas de vigencia.',
      'Reconocer que los estatus solo se actualizan entre el término de un ciclo y el inicio oficial del nuevo.',
      'Si validas un estatus incorrecto, entra de manera urgente a tu cuenta en SIATCE.',
      'Dirígete a "Trámites disponibles", selecciona "Aclaración de Estatus" y procesa las instrucciones dictadas.'
    ]
  },
  {
    id: '26', title: 'Aclaración de agenda de auto-registro',
    description: 'Apelación e interpelación del orden y fechas provistas por Control y Registro Escolar para tu carga del siguiente ciclo.',
    category: 'Aclaraciones', time: 'Respuesta en 1 día hábil', cost: 'Sin Costo', location: 'Plataforma SIATSE',
    requirements: [
      'Haber cumplido con los periodos previos y haber hecho correctamente el Pre-Registro en tiempo.',
      'Aceptar que la agenda central se compone 100% de combinatoria entre el pre-registro y tu promedio neto.',
      'Hacer el cuestionamiento en SIATCE sólamente después de que ocurre la Publicación Oficial de la agenda.',
      'Localizar el reporte o caso en menú "Trámites Varios" -> "Aclaración de tu Agenda".'
    ]
  }
];

export const TramitesView: React.FC = () => {
  usePerfViewLoadEnd({
    path: '/tramites',
    label: 'Trámites',
    isLoading: false,
  });

  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('Todas');
  const [selectedTramite, setSelectedTramite] = useState<Tramite | null>(null);

  useEffect(() => {
    const qParam = searchParams.get('q');
    const tramiteId = searchParams.get('tramite');

    if (qParam) {
      const decoded = decodeURIComponent(qParam);
      if (TRAMITE_CATEGORIES.includes(decoded)) {
        setActiveCategory(decoded);
        setSearchTerm('');
      } else {
        setActiveCategory('Todas');
        setSearchTerm(decoded);
      }
    }

    if (tramiteId) {
      const found = TRAMITES_DATA.find((tramite) => tramite.id === tramiteId) ?? null;
      setSelectedTramite((current) => (current?.id === found?.id ? current : found));
      return;
    }

    setSelectedTramite((current) => (current ? null : current));
  }, [searchParams]);

  const openTramite = (tramite: Tramite) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tramite', tramite.id);
    setSearchParams(nextParams, { replace: true });
    setSelectedTramite(tramite);
  };

  const closeTramite = () => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('tramite');
    setSearchParams(nextParams, { replace: true });
    setSelectedTramite(null);
  };

  const filteredTramites = useMemo(() => {
    return TRAMITES_DATA.filter(t => {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = t.title.toLowerCase().includes(searchLower) ||
        t.description.toLowerCase().includes(searchLower) ||
        t.requirements.some(r => r.toLowerCase().includes(searchLower));

      const matchesCategory = activeCategory === 'Todas' || t.category === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [searchTerm, activeCategory]);

  return (
    <>
      <div className="tramites-scroll-area bg-slate-950">
        <div className="tramites-container animate-fade-in">

          <div className="tramites-header">
            <div className="header-title">
              <div className="icon-wrapper">
                <ClipboardCheck size={28} />
              </div>
              <div>
                <h1 className="text-white">Guía de Trámites</h1>
                <p>Mostrando {filteredTramites.length} gestiones oficiales disponibles en CUCEI (toda la información fue recabada de la página oficial de SIATCE).</p>
              </div>
            </div>

            <div className="search-wrapper glass-panel shadow-lg shadow-cyan-900/10">
              <Search size={20} className="search-icon" />
              <input
                type="text"
                placeholder="Buscar acta, constancia, kardex, 33..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="glass-panel p-5 mt-4 mb-6 rounded-2xl border border-rose-500/20 bg-rose-500/5">
            <h4 className="flex items-center gap-2 text-rose-400 font-bold mb-2">
              <AlertTriangle size={18} /> Nota Importante Sobre Pagos
            </h4>
            <p className="text-slate-300 text-sm leading-relaxed">
              En caso de que el trámite tenga un costo, éste será cargado a tu Orden de Pago en SIIAU automáticamente.
              Para recibir tu documento en ventanilla <strong className="text-white">NO ES NECESARIO PRESENTAR TU PAGO FISICO</strong>, sólo el Comprobante de Trámite impreso desde el SIATCE.
            </p>
          </div>

          <div className="categories-filter mb-4 mt-2">
            {TRAMITE_CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`category-btn ${activeCategory === cat ? 'active' : ''}`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="tramites-grid">
            {filteredTramites.length > 0 ? (
              filteredTramites.map((tramite) => {
                const isGratuito = tramite.cost.toLowerCase() === 'gratuito' || tramite.cost.toLowerCase() === 'sin costo';

                return (
                  <div key={tramite.id} className="tramite-card glass-panel shadow-lg shadow-cyan-900/5">
                    <div className="card-header">
                      <span className="tramite-badge">{tramite.category}</span>
                      <div className="header-badges">
                        <span className={`tramite-cost ${isGratuito ? '' : 'cost-pending'}`}>
                          <Banknote size={14} />
                          {tramite.cost}
                        </span>
                      </div>
                    </div>

                    <h3 className="tramite-title">{tramite.title}</h3>
                    <div className="tramite-details">
                      <div className="detail-row">
                        <Clock size={16} className="detail-icon" />
                        <span className="truncate">{tramite.time}</span>
                      </div>
                      <div className="detail-row">
                        <MapPin size={16} className="detail-icon" />
                        <span className="truncate" title={tramite.location}>{tramite.location}</span>
                      </div>
                    </div>

                    <button
                      className="enroll-btn"
                      onClick={() => openTramite(tramite)}
                    >
                      Ver Detalles
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="no-results glass-panel">
                <BookOpen size={48} className="muted-icon" />
                <h3 className="text-white text-xl">No se encontraron trámites</h3>
                <p className="text-slate-400">Intenta buscar con otros términos.</p>
              </div>
            )}
          </div>



        </div>
      </div>

      {/* Modal View for Tramite Details */}
      {selectedTramite && createPortal(
        <div className="modal-overlay animate-fade-in" onClick={closeTramite}>
          <div className="tramites-modal modal-content animate-slide-up bg-slate-900 border border-slate-700" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={closeTramite}>
              <X size={24} />
            </button>

            <div className="modal-header">
              <span className="tramite-badge bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 px-3 py-1">{selectedTramite.category}</span>
            </div>

            <h2 className="modal-title">{selectedTramite.title}</h2>
            <p className="modal-description">{selectedTramite.description}</p>

            <div className="modal-details-grid">
              <div className="detail-item">
                <Banknote size={18} className="detail-icon" />
                <div>
                  <span className="detail-label">Costo</span>
                  <span className="detail-value">{selectedTramite.cost}</span>
                </div>
              </div>

              <div className="detail-item">
                <Clock size={18} className="detail-icon" />
                <div>
                  <span className="detail-label">Tiempo de Respuesta</span>
                  <span className="detail-value">{selectedTramite.time}</span>
                </div>
              </div>

              <div className="detail-item">
                <Building2 size={18} className="detail-icon" />
                <div>
                  <span className="detail-label">Lugar del Trámite</span>
                  <span className="detail-value">{selectedTramite.location}</span>
                </div>
              </div>

            </div>

            <div className="mt-6 mb-2">
              <h4 className="text-sm font-black uppercase text-slate-300 mb-4 tracking-widest flex items-center gap-2">
                <ClipboardCheck size={16} className="text-cyan-400" /> Requisitos y Pasos
              </h4>
              <ul className="space-y-3">
                {selectedTramite.requirements.map((req, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-slate-300 bg-slate-950/50 p-3 rounded-lg border border-slate-800/50">
                    <span className="flex-shrink-0 w-6 h-6 rounded-md bg-cyan-500/10 text-cyan-400 flex items-center justify-center text-xs font-black border border-cyan-500/20">
                      {i + 1}
                    </span>
                    <span className="pt-0.5">{req}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="modal-actions">
              {selectedTramite.externalUrl && (
                <a
                  href={selectedTramite.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 p-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-emerald-900/20"
                >
                  <FileText size={18} /> Descargar PDF
                </a>
              )}
              <a
                href="https://escolar.cucei.udg.mx/cescolar/login.aspx"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 p-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-cyan-900/20"
              >
                <Globe size={18} /> Acceder a SIATCE
              </a>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
