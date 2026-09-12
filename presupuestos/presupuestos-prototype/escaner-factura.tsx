import { useState, useRef, useEffect } from 'react';
import type { Factura, Proveedor } from './types.js';
import { EscanerDocumento } from './escaner-documento.js';
import type { ResultadoEscaneo } from './escaner-documento.js';
import { ImporteInput } from './importe-input.js';
import { leerArchivoComoBase64 } from './archivos.js';
import { comprimirImagen, rotarImagenDataUrl } from './procesamiento-imagenes.js';
import { urlImagenFiable } from './imagen-fallback.js';
import { Z_DESPLEGABLE } from './z-index.js';
import { etiquetaEstado } from './estado-utils.js';
import { resolverEmisorReceptor, nombresCoinciden, type EmpresaIdentificacion } from './identificacion-factura.js';
import { sugerirTipoImpuesto, estadoIvaIgicDeducible, agregarLineasFiscales, validarLineasFiscales, type RegionFiscal, type TipoImpuestoFactura } from './motor-fiscal.js';
import { aplicarSugerenciaCategoriaFiscal, type CategoriaFiscal } from './categoria-fiscal.js';
import { resolverTratamientoFiscal } from './motor-resolucion-fiscal.js';
import type { HechosFiscales, OrigenDecisionFiscal, LineaFiscal, TipoLineaFiscal } from './types.js';
import type { HechoFiscalRequerido } from './identificacion-gasto.js';
import * as api from './api.js';
import { puedeUsar, PRO_O_SUPERIOR, type PlanAcceso } from './planes.js';
import { CandadoPlan } from './candado-plan.js';
import styles from './styles.module.css';

/** Props del escáner de facturas. */
export type EscanerFacturaProps = {
  /** Lista de clientes para vincular la factura de gasto. */
  clientes: { id: string; nombre: string }[];
  /** Lista de proveedores para el desplegable. */
  proveedores?: Proveedor[];
  /**
   * Proyecto ya conocido (incremento "Cliente ≠ Proyecto", 20/08/2026) —
   * se pasa cuando el escáner se abre DESDE la ficha de un proyecto
   * concreto (`ficha-cliente.tsx`): el cliente y el proyecto quedan fijos
   * y no hace falta volver a elegirlos. Si no se pasa (pantalla global de
   * Facturas o "Escanear" del menú), el usuario elige cliente y, si tiene
   * más de un proyecto, también el proyecto — nunca se adivina.
   */
  proyectoFijo?: { id: string; clienteId: string; nombre: string };
  /**
   * Callback al guardar la factura procesada. `datosProveedorDetectados`
   * (27/08/2026) va aparte de la propia `Factura` porque esos campos no le
   * pertenecen a ella, sino a la ficha del proveedor: dirección/código
   * postal/CIF que la IA ha leído en el documento y que el proveedor
   * todavía no tiene guardados — quien recibe este callback (`facturas.tsx`,
   * `ficha-cliente.tsx`) decide si completar la ficha con ellos, vía
   * `autoCrearProveedorDeFactura` (`proveedor-utils.ts`).
   */
  onGuardar: (f: Factura, datosProveedorDetectados?: DatosProveedorDetectados) => void;
  /** Callback al cerrar sin guardar. */
  onCerrar: () => void;
  /** Factura existente para editar (si se pasa, el modal abre en modo edición). */
  facturaEditar?: Factura;
  /** Plan de la sesión actual (Fase 2.5, 04/09/2026) — solo gatea "Extraer datos con IA"; capturar la página y rellenar los campos a mano siguen disponibles en cualquier plan. */
  plan?: PlanAcceso;
  /** Bypass administrativo (05/09/2026) — ver `puedeUsar()` en `planes.ts`. */
  esAdmin?: boolean;
};

/** Una página del documento escaneado — puede ser una imagen o un PDF subido directamente. */
type Pagina = { id: string; dataUrl: string; nombre: string; tipo: 'imagen' | 'pdf' };

/** Ver el comentario de `onGuardar` en `EscanerFacturaProps`. */
export type DatosProveedorDetectados = { direccion?: string; codigoPostal?: string; cifNif?: string };

/** Genera un id único. */
function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * El botón "Extraer datos con IA" usa el perfil `vision` (solo OpenAI,
 * gpt-4o-mini) — activo ahora que el usuario ha decidido pasar a OpenAI de
 * pago (12/08/2026, tras confirmar que Ollama en local era demasiado
 * lento). Necesita `OPENAI_API_KEY` configurada en el servidor para
 * funcionar de verdad; sin ella, la llamada falla con un error claro en
 * vez de dar un resultado inventado.
 */
const IA_FACTURA_DISPONIBLE = true;

/**
 * Selector de tratamiento fiscal (Fase 3B) — 4 botones (Por revisar / 100% /
 * Parcial / 0%), reutilizado para IRPF e IVA/IGIC. `valor` es exactamente
 * `Factura.deducibleIrpf`/`ivaIgicDeducible`: `undefined` = por revisar,
 * un número = decisión real ya tomada (`0`/`100` incluidos). "Parcial"
 * siempre exige escribir un número nuevo — nunca deja un valor previo (p.
 * ej. un 100% ya elegido) guardado en silencio bajo el botón "Parcial".
 */
function SelectorDeducibilidad({ etiqueta, valor, onCambiar }: { etiqueta: string; valor: number | undefined; onCambiar: (v: number | undefined) => void }) {
  const [parcialAbierto, setParcialAbierto] = useState(valor !== undefined && valor !== 0 && valor !== 100);
  const [textoParcial, setTextoParcial] = useState(parcialAbierto ? String(valor) : '');

  const elegirFijo = (v: number | undefined) => { setParcialAbierto(false); onCambiar(v); };
  const abrirParcial = () => { setParcialAbierto(true); setTextoParcial(''); onCambiar(undefined); };
  const cambiarParcial = (texto: string) => {
    setTextoParcial(texto);
    const n = parseFloat(texto.replace(',', '.'));
    onCambiar(Number.isFinite(n) && n >= 0 && n <= 100 ? n : undefined);
  };

  const activo = (v: number | undefined) => !parcialAbierto && valor === v;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
      <span style={{ fontSize: '0.82rem', color: 'var(--topo)' }}>{etiqueta}</span>
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        <button type="button" className={`${styles.btn} ${activo(undefined) ? styles.btnPrimario : styles.btnSecundario}`} style={{ fontSize: '0.76rem', flex: '1 1 90px' }} onClick={() => elegirFijo(undefined)}>Por revisar</button>
        <button type="button" className={`${styles.btn} ${activo(100) ? styles.btnPrimario : styles.btnSecundario}`} style={{ fontSize: '0.76rem', flex: '1 1 70px' }} onClick={() => elegirFijo(100)}>100%</button>
        <button type="button" className={`${styles.btn} ${parcialAbierto ? styles.btnPrimario : styles.btnSecundario}`} style={{ fontSize: '0.76rem', flex: '1 1 80px' }} onClick={abrirParcial}>Parcial</button>
        <button type="button" className={`${styles.btn} ${activo(0) ? styles.btnPrimario : styles.btnSecundario}`} style={{ fontSize: '0.76rem', flex: '1 1 70px' }} onClick={() => elegirFijo(0)}>0%</button>
      </div>
      {parcialAbierto && (
        <div>
          <input
            className={styles.input} style={{ width: '100%', maxWidth: 110, boxSizing: 'border-box' }}
            type="number" min={0} max={100} placeholder="%"
            value={textoParcial} onChange={(e) => cambiarParcial(e.target.value)}
          />
          {textoParcial !== '' && valor === undefined && (
            <p style={{ margin: '0.3rem 0 0', fontSize: '0.72rem', color: 'var(--rojo)' }}>El porcentaje debe estar entre 0 y 100.</p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Bloque de tratamiento fiscal de un eje (IRPF o IVA/IGIC) — Fase 3C.3.
 * El usuario NUNCA elige aquí un porcentaje de deducibilidad a ciegas: si el
 * motor puede resolverlo, se muestra el resultado ya calculado; si falta un
 * hecho concreto, se pregunta ESE hecho (nunca "¿qué porcentaje?"); el
 * selector manual de siempre (`SelectorDeducibilidad`) queda como última
 * opción, para un valor ya decidido a mano o para corregir expresamente un
 * resultado automático. `resolucion` es un cálculo EN VIVO con los datos
 * actuales del formulario (`resolverTratamientoFiscal`, sin persistir nada
 * desde aquí) — la resolución real y definitiva solo la escribe el backend
 * al guardar (`guardarFactura()`), que es quien de verdad decide `origen`.
 */
function TratamientoFiscalEje({
  etiqueta, valor, origen, resolucion, pregunta, onCambiarValor, onResponderHecho,
}: {
  etiqueta: string;
  valor: number | undefined;
  origen: OrigenDecisionFiscal | undefined;
  resolucion: { estado: string; porcentaje?: number; explicacion: string; fuenteOficial?: { organismo: string; referencia: string } } | null;
  pregunta: { pregunta: string } | undefined;
  onCambiarValor: (v: number | undefined) => void;
  onResponderHecho: (respuesta: boolean) => void;
}) {
  const [corregirAMano, setCorregirAMano] = useState(false);
  const [porQueAbierto, setPorQueAbierto] = useState(false);

  if (corregirAMano || typeof valor === 'number') {
    // Valor ya decidido (automático o humano) — o el usuario ha pedido decidirlo él mismo.
    if (typeof valor === 'number' && !corregirAMano) {
      const esAutomatico = origen === 'automatico';
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <span style={{ fontSize: '0.82rem', color: 'var(--topo)' }}>{etiqueta}</span>
          <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, color: esAutomatico ? 'var(--verde, #2e7d32)' : 'var(--negro)' }}>
            {esAutomatico ? '✓ ' : ''}{valor}%
            {esAutomatico && <span style={{ fontWeight: 400, fontSize: '0.76rem', color: 'var(--topo-claro)' }}> — calculado automáticamente según los datos de la factura.</span>}
          </p>
          <div style={{ display: 'flex', gap: '0.6rem' }}>
            {esAutomatico && resolucion?.explicacion && (
              <button type="button" className={styles.btn} style={{ fontSize: '0.72rem', padding: '0.2rem 0' }} onClick={() => setPorQueAbierto((v) => !v)}>
                {porQueAbierto ? 'Ocultar' : '¿Por qué?'}
              </button>
            )}
            <button type="button" className={styles.btn} style={{ fontSize: '0.72rem', padding: '0.2rem 0' }} onClick={() => setCorregirAMano(true)}>Corregir a mano</button>
          </div>
          {porQueAbierto && resolucion && (
            <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--topo-claro)', background: 'var(--fondo-caja)', padding: '0.5rem', borderRadius: 6 }}>
              {resolucion.explicacion}
              {resolucion.fuenteOficial && <><br /><em>Fuente: {resolucion.fuenteOficial.organismo} — {resolucion.fuenteOficial.referencia}</em></>}
            </p>
          )}
        </div>
      );
    }
    return <SelectorDeducibilidad etiqueta={etiqueta} valor={valor} onCambiar={onCambiarValor} />;
  }

  if (pregunta) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <span style={{ fontSize: '0.82rem', color: 'var(--topo)' }}>{etiqueta}</span>
        <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600 }}>{pregunta.pregunta}</p>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button type="button" className={`${styles.btn} ${styles.btnSecundario}`} style={{ fontSize: '0.76rem', flex: 1 }} onClick={() => onResponderHecho(true)}>Sí</button>
          <button type="button" className={`${styles.btn} ${styles.btnSecundario}`} style={{ fontSize: '0.76rem', flex: 1 }} onClick={() => onResponderHecho(false)}>No</button>
        </div>
        <button type="button" className={styles.btn} style={{ fontSize: '0.72rem', alignSelf: 'flex-start', padding: '0.2rem 0' }} onClick={() => setCorregirAMano(true)}>Prefiero decidirlo yo mismo</button>
      </div>
    );
  }

  if (resolucion?.estado === 'resuelto_automatico') {
    // Todavía no guardado (nada persistido ni por el usuario ni por el motor) pero, con los
    // datos actuales del formulario, así es como quedaría al pulsar "Guardar" — aviso, no un hecho consumado.
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
        <span style={{ fontSize: '0.82rem', color: 'var(--topo)' }}>{etiqueta}</span>
        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--topo-claro)' }}>
          Se calculará automáticamente al guardar: <strong>{resolucion.porcentaje}%</strong>
        </p>
        <button type="button" className={styles.btn} style={{ fontSize: '0.72rem', alignSelf: 'flex-start', padding: '0.2rem 0' }} onClick={() => setCorregirAMano(true)}>Decidirlo yo mismo</button>
      </div>
    );
  }

  return <SelectorDeducibilidad etiqueta={etiqueta} valor={valor} onCambiar={onCambiarValor} />;
}

/**
 * Modal para añadir facturas manualmente o con captura de imagen.
 * Soporta múltiples hojas/páginas que se combinan como un único documento.
 */
export function EscanerFactura({ clientes, proveedores = [], proyectoFijo, onGuardar, onCerrar, facturaEditar, plan, esAdmin }: EscanerFacturaProps) {
  const tienePlanIA = puedeUsar(plan, PRO_O_SUPERIOR, esAdmin);
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false);
  const esEdicion = !!facturaEditar;
  const [paginas, setPaginas] = useState<Pagina[]>(() => {
    if (facturaEditar?.paginas?.length) {
      return facturaEditar.paginas.map((p) => ({ id: uid(), dataUrl: p.url, nombre: p.tipo === 'pdf' ? 'PDF' : 'Página', tipo: p.tipo }));
    }
    if (facturaEditar?.pdfOriginalUrl) return [{ id: uid(), dataUrl: facturaEditar.pdfOriginalUrl, nombre: 'PDF original', tipo: 'pdf' }];
    if (facturaEditar?.imagen) {
      // Facturas de antes de esta ampliación: el campo `imagen` se usaba
      // también para PDFs subidos directamente (sin ningún campo propio
      // donde guardarlos) — detectar el tipo real por el prefijo de la data
      // URL en vez de asumir siempre imagen, o un PDF viejo se intentaría
      // pintar con <img> (roto) o incrustar como JPEG en el PDF generado
      // (falla al descargar).
      const esPdf = facturaEditar.imagen.startsWith('data:application/pdf');
      return [{ id: uid(), dataUrl: facturaEditar.imagen, nombre: esPdf ? 'PDF original' : 'Imagen actual', tipo: esPdf ? 'pdf' : 'imagen' }];
    }
    return [];
  });
  const [origen, setOrigen] = useState<'escaner' | 'foto' | 'pdf' | 'manual' | ''>(facturaEditar?.origen ?? '');
  const [paginaVista, setPaginaVista] = useState(0);
  const [tipo, setTipo] = useState<'ingreso' | 'gasto'>(facturaEditar?.tipo ?? 'gasto');
  const [fecha, setFecha] = useState(facturaEditar?.fecha ?? new Date().toISOString().slice(0, 10));
  const [importe, setImporte] = useState(facturaEditar ? String(facturaEditar.importe) : '');
  const [concepto, setConcepto] = useState(facturaEditar?.concepto ?? '');
  const [proveedor, setProveedor] = useState(facturaEditar?.proveedor ?? '');
  const [proveedorId, setProveedorId] = useState(facturaEditar?.proveedorId ?? '');
  const [clienteId, setClienteId] = useState(facturaEditar?.clienteId ?? proyectoFijo?.clienteId ?? '');
  /**
   * Proyectos del cliente elegido — se piden en cuanto se selecciona un
   * cliente (incremento "Cliente ≠ Proyecto", 20/08/2026), para poder
   * pedir explícitamente A QUÉ proyecto pertenece el gasto cuando el
   * cliente tiene más de uno. Con `proyectoFijo` no hace falta: cliente y
   * proyecto ya vienen decididos por la ficha desde la que se abrió.
   */
  const [proyectosDelCliente, setProyectosDelCliente] = useState<{ id: string; proyecto: string; estado: string }[]>([]);
  const [proyectoId, setProyectoId] = useState(facturaEditar?.proyectoId ?? proyectoFijo?.id ?? '');
  useEffect(() => {
    if (proyectoFijo || !clienteId) { setProyectosDelCliente([]); return; }
    let cancelado = false;
    api.obtenerProyectosDeCliente(clienteId).then((lista) => {
      if (cancelado) return;
      setProyectosDelCliente(lista);
      // Un único proyecto → sin ambigüedad, se preselecciona (el usuario
      // puede dejarlo así o, si hubiera más adelante, cambiarlo). Con 0 o
      // 2+, nunca se adivina: el campo se deja vacío para que sea una
      // elección explícita, o quede pendiente de vincular a propósito.
      setProyectoId((actual) => (lista.length === 1 ? lista[0].id : (lista.some((p) => p.id === actual) ? actual : '')));
    }).catch(() => setProyectosDelCliente([]));
    return () => { cancelado = true; };
  }, [clienteId, proyectoFijo]);
  const [numeroFactura, setNumeroFactura] = useState(facturaEditar?.numeroFactura ?? '');
  const [cifNif, setCifNif] = useState(facturaEditar?.cifNif ?? '');
  const [categoria, setCategoria] = useState(facturaEditar?.categoria ?? '');
  /**
   * Clasificación fiscal interna (Fase 3C.1) — "qué tipo de gasto es",
   * nunca si es deducible. Separada de `categoria` (texto libre, sin
   * cambios). `undefined` = nunca clasificada — sin selector manual
   * todavía en esta fase, solo llega vía sugerencia de IA (ver
   * `extraerConIA`, más abajo).
   */
  const [categoriaFiscal, setCategoriaFiscal] = useState<CategoriaFiscal | undefined>(facturaEditar?.categoriaFiscal);
  /** Naturaleza real del impuesto DE ESTA FACTURA — nunca se deriva de `regionFiscal` de la empresa, solo se sugiere como valor por defecto en facturas nuevas sin dato todavía (ver `motor-fiscal.ts` → `sugerirTipoImpuesto`). */
  const [tipoImpuesto, setTipoImpuesto] = useState<TipoImpuestoFactura>(facturaEditar?.tipoImpuesto ?? '');
  /**
   * Desglose fiscal por tramos (auditoría 12/09/2026) — una factura puede
   * traer varias bases/cuotas del mismo impuesto a distinto porcentaje
   * (p. ej. partidas al 3% y al 7% de IGIC en el mismo documento); antes
   * solo había sitio para una, así que la extracción con IA se quedaba con
   * un tramo y descartaba el resto en silencio. `baseImponible`/
   * `porcentajeImpuesto`/`importeImpuesto` de `Factura` pasan a ser SOLO
   * la suma/resumen derivado de estas líneas — nunca se editan sueltos.
   * Migración de facturas antiguas de un único tramo: si no hay
   * `lineasFiscales` pero sí los campos sueltos de siempre, se muestran
   * como una única línea, editable igual que las demás.
   */
  const [lineasFiscales, setLineasFiscales] = useState<LineaFiscal[]>(() => {
    if (facturaEditar?.lineasFiscales?.length) return facturaEditar.lineasFiscales;
    if (facturaEditar && (facturaEditar.baseImponible || facturaEditar.importeImpuesto || facturaEditar.porcentajeImpuesto)) {
      const tipoValido = facturaEditar.tipoImpuesto === 'iva' || facturaEditar.tipoImpuesto === 'igic' || facturaEditar.tipoImpuesto === 'exento' || facturaEditar.tipoImpuesto === 'sin_impuesto';
      return [{
        id: uid(),
        tipo: tipoValido ? (facturaEditar.tipoImpuesto as TipoLineaFiscal) : 'igic',
        porcentaje: facturaEditar.porcentajeImpuesto ?? 0,
        baseImponible: facturaEditar.baseImponible ?? 0,
        cuota: facturaEditar.importeImpuesto ?? 0,
      }];
    }
    return [];
  });
  /**
   * Tratamiento fiscal (Fase 3B) — decisión humana explícita, nunca
   * calculada. `undefined` = por revisar (también el estado de toda
   * factura histórica, sin migración). Separado de `importeImpuesto`, que
   * nunca se toca.
   */
  const [deducibleIrpf, setDeducibleIrpf] = useState<number | undefined>(facturaEditar?.deducibleIrpf);
  const [ivaIgicDeducible, setIvaIgicDeducible] = useState<number | undefined>(facturaEditar?.ivaIgicDeducible);
  /**
   * Origen de la decisión (Fase 3C.3) — quién puso el número de arriba:
   * ausente = decisión humana histórica (de antes de esta fase) o nunca
   * decidido; `'automatico'` = lo puso el motor la última vez que se
   * guardó. Se actualiza a `'usuario'` en cuanto el propio usuario toca el
   * selector manual — el backend es quien decide esto de verdad al
   * guardar, esto solo mantiene la UI coherente mientras se edita.
   */
  const [deducibleIrpfOrigen, setDeducibleIrpfOrigen] = useState<OrigenDecisionFiscal | undefined>(facturaEditar?.deducibleIrpfOrigen);
  const [ivaIgicDeducibleOrigen, setIvaIgicDeducibleOrigen] = useState<OrigenDecisionFiscal | undefined>(facturaEditar?.ivaIgicDeducibleOrigen);
  /** Hechos factuales ya confirmados por el usuario (Fase 3C.3) — el HECHO, nunca el porcentaje resultante; lo traduce el motor. */
  const [hechosFiscales, setHechosFiscales] = useState<HechosFiscales | undefined>(facturaEditar?.hechosFiscales);
  /** Solo para la sugerencia de `tipoImpuesto` en facturas nuevas y para el motor fiscal (Fase 3C.3) — nunca se usa para sobrescribir un dato ya presente. */
  const [regionFiscal, setRegionFiscal] = useState<RegionFiscal>('');
  const [repepActivo, setRepepActivo] = useState(false);
  const [datosFiscalesAbierto, setDatosFiscalesAbierto] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const camaraRef = useRef<HTMLInputElement>(null);
  const [escanerDocAbierto, setEscanerDocAbierto] = useState(false);

  // ── Extracción de datos con IA (Fase Facturas Profesional) ──
  const [extrayendo, setExtrayendo] = useState(false);
  const [errorExtraccion, setErrorExtraccion] = useState<string | null>(null);
  const [confianzaIA, setConfianzaIA] = useState<'alta' | 'media' | 'baja' | null>(null);
  /** true si `resolverEmisorReceptor` no pudo determinar con seguridad quién es Madera Creativa en el documento — nunca se decide por adivinanza, se pide revisión explícita. */
  const [avisoRevisarEmisor, setAvisoRevisarEmisor] = useState(false);
  /** Nombre/CIF propios (Ajustes de empresa) — referencia para distinguir a Madera Creativa del cliente/proveedor del documento (auditoría emisor/receptor, 23/08/2026). */
  const [empresa, setEmpresa] = useState<EmpresaIdentificacion | null>(null);

  /**
   * Aviso de posible factura repetida (petición explícita del usuario,
   * 26/08/2026: fallo humano real, no un caso raro — escanear dos veces
   * sin querer el mismo papel). Se comprueba al pulsar "Guardar factura",
   * nunca bloquea: si hay coincidencia se muestra el aviso y el usuario
   * decide si de verdad quiere guardarla otra vez.
   */
  const [duplicado, setDuplicado] = useState<Factura | null>(null);
  const [comprobandoDuplicado, setComprobandoDuplicado] = useState(false);

  /**
   * Dirección/código postal del proveedor leídos en el documento
   * (27/08/2026) — nunca se guardan en la propia Factura (no le
   * pertenecen), solo viajan hasta `guardar()` para poder completar la
   * ficha del proveedor en automático si todavía no los tiene.
   */
  const [direccionDetectada, setDireccionDetectada] = useState('');
  const [codigoPostalDetectado, setCodigoPostalDetectado] = useState('');
  useEffect(() => {
    api.obtenerEmpresa()
      .then((e) => { setEmpresa({ nombre: e.nombre ?? '', titular: e.titular ?? '', nifCif: e.nifCif ?? '' }); setRegionFiscal(e.regionFiscal ?? ''); setRepepActivo(!!e.repepActivo); })
      .catch(() => setEmpresa({ nombre: '', titular: '', nifCif: '' }));
  }, []);

  // Sugerencia de tipo de impuesto SOLO en facturas nuevas y SOLO si el
  // campo sigue vacío cuando llega la región — nunca sobrescribe un valor
  // ya elegido a mano o detectado por la IA (ver `sugerirTipoImpuesto`).
  useEffect(() => {
    if (facturaEditar || !regionFiscal) return;
    setTipoImpuesto((actual) => (actual ? actual : sugerirTipoImpuesto(regionFiscal) ?? ''));
  }, [regionFiscal, facturaEditar]);

  const extraerConIA = async () => {
    // Todas las páginas de tipo imagen, en el mismo orden en que se
    // capturaron — antes solo se enviaba `paginas.find(...)` (la primera),
    // así que en un documento de varias páginas la IA nunca llegaba a ver
    // el resumen fiscal si este no estaba en la primera hoja (auditoría
    // 11/09/2026). Las páginas de tipo 'pdf' (subidas directamente) no se
    // envían — el perfil `vision` solo puede leer imágenes.
    const paginasImagen = paginas.filter((p) => p.tipo === 'imagen');
    if (!paginasImagen.length) return;
    setExtrayendo(true);
    setErrorExtraccion(null);
    setConfianzaIA(null);
    setAvisoRevisarEmisor(false);
    try {
      // Una página recién escaneada ya es un data URL en memoria; una
      // página de una factura YA GUARDADA es una URL del servidor (el
      // proxy de almacenamiento privado devuelve una ruta relativa,
      // pensada para que la complete el navegador, no para que la
      // descargue un servicio externo) — la IA no puede leerla tal cual,
      // así que aquí se descarga y se convierte a base64 antes de
      // enviarla (auditoría 11/09/2026, error real de OpenAI: "400 Failed
      // to download file. File URL is invalid.").
      const imagenesBase64 = await Promise.all(
        paginasImagen.map(async (p) => {
          if (p.dataUrl.startsWith('data:')) return p.dataUrl;
          const blob = await (await fetch(p.dataUrl)).blob();
          return leerArchivoComoBase64(blob);
        })
      );
      const resp = await api.generarRespuestaIA({
        capacidad: 'extraer-datos-factura',
        mensajes: [{
          role: 'user',
          content: paginasImagen.length > 1
            ? `Extrae los datos de esta factura. Se adjuntan las ${paginasImagen.length} páginas de este mismo documento, en orden.`
            : 'Extrae los datos de esta factura.',
          imagenes: imagenesBase64,
        }],
      });
      const limpio = resp.respuesta.trim().replace(/^```json\s*|```$/g, '');
      const datos = JSON.parse(limpio);
      // La IA describe el documento (emisor/receptor con nombre y CIF/NIF si
      // constan); quién de los dos es Madera Creativa y qué va en
      // `proveedor`/`cifNif` lo decide `resolverEmisorReceptor` comparando
      // datos objetivos — nunca se asigna directamente lo que devuelve la IA.
      const resuelto = resolverEmisorReceptor(
        {
          emisorNombre: datos.emisorNombre ?? null,
          emisorCifNif: datos.emisorCifNif ?? null,
          emisorDireccion: datos.emisorDireccion ?? null,
          emisorCodigoPostal: datos.emisorCodigoPostal ?? null,
          receptorNombre: datos.receptorNombre ?? null,
          receptorCifNif: datos.receptorCifNif ?? null,
          receptorDireccion: datos.receptorDireccion ?? null,
          receptorCodigoPostal: datos.receptorCodigoPostal ?? null,
          tipo: datos.tipo === 'ingreso' || datos.tipo === 'gasto' ? datos.tipo : null,
        },
        empresa ?? { nombre: '', titular: '', nifCif: '' }
      );
      // La IA propone — solo rellena los campos, el usuario debe revisar y
      // pulsar "Guardar factura" para confirmar. Nunca sobrescribe con
      // `null`/vacío lo que el usuario ya hubiera escrito a mano.
      if (resuelto.proveedor) {
        setProveedor(resuelto.proveedor);
        // Vincula con un proveedor ya existente si el nombre coincide,
        // tanto para poder rellenar el CIF guardado (ver abajo) como para
        // que la factura quede vinculada de verdad (`proveedorId`) y no
        // solo por texto — antes esto se calculaba SOLO cuando la IA no
        // traía CIF, y en cualquier otro caso se perdía la vinculación
        // aunque el nombre coincidiera exactamente con uno ya existente.
        const conocido = proveedores.find((p) => nombresCoinciden(p.nombre, resuelto.proveedor));
        setProveedorId(conocido?.id ?? '');
        // Si la IA no ha podido leer el CIF/NIF en la imagen (habitual en
        // cadenas grandes como Leroy Merlin o Bricomart, donde sale en
        // letra diminuta y no siempre se localiza), pero este proveedor ya
        // está dado de alta con su CIF guardado a mano (Proveedores), se
        // usa ese en vez de dejarlo en blanco (27/08/2026) — nunca al
        // revés: un CIF que la IA sí ha leído en el documento manda
        // siempre sobre el guardado.
        if (!resuelto.cifNif && conocido?.cifNif) setCifNif(conocido.cifNif);
      }
      if (resuelto.cifNif) setCifNif(resuelto.cifNif);
      // Dirección/CP leídos en el documento — se guardan aparte (nunca en
      // la propia Factura) para poder completar la ficha del proveedor al
      // guardar, ver `guardar()` más abajo.
      if (resuelto.direccion) setDireccionDetectada(resuelto.direccion);
      if (resuelto.codigoPostal) setCodigoPostalDetectado(resuelto.codigoPostal);
      if (resuelto.tipo) setTipo(resuelto.tipo);
      if (datos.numeroFactura) setNumeroFactura(datos.numeroFactura);
      if (datos.fecha) setFecha(datos.fecha);
      // Lo que la IA dice haber leído en el propio documento manda sobre la
      // sugerencia por región, pero JAMÁS sobre un tipo que el usuario ya
      // hubiera elegido a mano — se aplica solo si el campo sigue vacío.
      const tiposValidos: TipoImpuestoFactura[] = ['iva', 'igic', 'exento', 'sin_impuesto'];
      if (tiposValidos.includes(datos.tipoImpuestoSugerido)) {
        setTipoImpuesto((actual) => (actual ? actual : datos.tipoImpuestoSugerido));
      }
      // Desglose fiscal por tramos (auditoría 12/09/2026, corrección 12/09/2026-b)
      // — la IA devuelve UNA entrada por cada tramo real del resumen fiscal
      // (nunca se resume a una sola). Antes esto nunca se aplicaba si ya
      // había alguna línea, aunque esa línea viniera de una extracción
      // anterior incompleta (p. ej. solo el tramo del 7%, con el aviso de
      // descuadre encendido) — una nueva extracción se quedaba bloqueada
      // para siempre y el usuario tenía que añadir el tramo que faltaba a
      // mano (reporte real del usuario, 12/09/2026). Ahora solo se
      // protegen las líneas ya presentes si de verdad CUADRAN con el
      // importe actual (mismo criterio que el aviso de descuadre del
      // formulario) — eso sí es una decisión ya confirmada, humana o de una
      // extracción anterior completa. Si no cuadran, es la señal de que
      // nada quedó confirmado todavía, y una nueva extracción puede
      // sustituirlas enteras por la lectura de ahora.
      const tiposLineaValidos: TipoLineaFiscal[] = ['iva', 'igic', 'exento', 'sin_impuesto'];
      if (Array.isArray(datos.lineasFiscales) && datos.lineasFiscales.length > 0) {
        const importeActual = parseFloat(String(importe).replace(',', '.')) || 0;
        setLineasFiscales((actual) => {
          if (actual.length > 0 && validarLineasFiscales(actual, importeActual).valido) return actual;
          return datos.lineasFiscales
            .filter((l: any) => l && tiposLineaValidos.includes(l.tipo) && typeof l.baseImponible === 'number' && typeof l.cuota === 'number')
            .map((l: any) => ({ id: uid(), tipo: l.tipo, porcentaje: typeof l.porcentaje === 'number' ? l.porcentaje : 0, baseImponible: l.baseImponible, cuota: l.cuota }));
        });
      }
      if (typeof datos.importe === 'number') setImporte(String(datos.importe));
      if (datos.concepto) setConcepto(datos.concepto);
      if (datos.categoria) setCategoria(datos.categoria);
      // categoriaFiscal (Fase 3C.1) solo tiene sentido en gastos — el
      // prompt ya le pide a la IA devolver `null` en ingresos, se refuerza
      // aquí para no depender solo de eso. Mismo criterio que
      // tipoImpuesto: nunca sobrescribe un valor ya presente.
      if ((resuelto.tipo || tipo) === 'gasto') {
        setCategoriaFiscal((actual) => aplicarSugerenciaCategoriaFiscal(actual, datos.categoriaFiscalSugerida));
      }
      if ((Array.isArray(datos.lineasFiscales) && datos.lineasFiscales.length > 0) || tiposValidos.includes(datos.tipoImpuestoSugerido)) setDatosFiscalesAbierto(true);
      setConfianzaIA(resuelto.confianza);
      setAvisoRevisarEmisor(resuelto.revisar);
    } catch {
      setErrorExtraccion('No se pudieron extraer los datos automáticamente. Revísalos a mano.');
    } finally {
      setExtrayendo(false);
    }
  };

  /** Cuando el escáner de documento confirma, añade TODAS las hojas capturadas (no solo la que estuviera activa) — los datos de la factura (proveedor, importe, tipo, cliente…) se rellenan aquí mismo, en este formulario. */
  const onDocumentoEscaneado = (r: ResultadoEscaneo) => {
    setPaginas(prev => {
      const nuevas: Pagina[] = r.dataUrls.map((dataUrl, i) => ({
        id: uid(),
        dataUrl,
        nombre: r.dataUrls.length > 1 ? `Documento escaneado ${i + 1}` : 'Documento escaneado',
        tipo: 'imagen',
      }));
      const updated = [...prev, ...nuevas];
      setPaginaVista(updated.length - 1);
      return updated;
    });
    setOrigen('escaner');
    setEscanerDocAbierto(false);
  };

  /** Añade uno o más archivos (foto de cámara o subida) como páginas nuevas al final. Un PDF se conserva tal cual, nunca se intenta decodificar como imagen. */
  const agregarArchivos = async (files: FileList | null, origenCaptura: 'foto' | 'manual' = 'manual') => {
    if (!files || files.length === 0) return;
    const nuevas: Pagina[] = [];
    let huboPdf = false;
    for (const file of Array.from(files)) {
      if (file.type === 'application/pdf') {
        const dataUrl = await leerArchivoComoBase64(file);
        nuevas.push({ id: uid(), dataUrl, nombre: file.name, tipo: 'pdf' });
        huboPdf = true;
      } else {
        const dataUrl = await comprimirImagen(file, { forzarJpeg: true }).then(({ blob }) => leerArchivoComoBase64(blob));
        nuevas.push({ id: uid(), dataUrl, nombre: file.name, tipo: 'imagen' });
      }
    }
    setPaginas(prev => {
      const updated = [...prev, ...nuevas];
      setPaginaVista(updated.length - 1);
      return updated;
    });
    setOrigen(huboPdf ? 'pdf' : origenCaptura);
  };

  const quitarPagina = (id: string) => {
    setPaginas(prev => {
      const updated = prev.filter(p => p.id !== id);
      setPaginaVista(v => Math.min(v, Math.max(0, updated.length - 1)));
      return updated;
    });
  };

  const [rotando, setRotando] = useState(false);

  /** Rota la imagen de una hoja 90° — fotos de "Foto rápida" que salen apaisadas en vez de en vertical (reporte real, 25/08/2026), sin tener que repetir la captura. */
  const rotarPagina = async (id: string, sentido: 1 | -1) => {
    const pagina = paginas.find(p => p.id === id);
    if (!pagina || pagina.tipo !== 'imagen') return;
    setRotando(true);
    try {
      const dataUrl = await rotarImagenDataUrl(pagina.dataUrl, sentido);
      setPaginas(prev => prev.map(p => (p.id === id ? { ...p, dataUrl } : p)));
    } finally {
      setRotando(false);
    }
  };

  const moverPagina = (id: string, dir: -1 | 1) => {
    setPaginas(prev => {
      const idx = prev.findIndex(p => p.id === id);
      if (idx < 0) return prev;
      const nuevo = idx + dir;
      if (nuevo < 0 || nuevo >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[nuevo]] = [arr[nuevo], arr[idx]];
      setPaginaVista(nuevo);
      return arr;
    });
  };

  /** Suma en vivo de `lineasFiscales` — nunca se guarda por separado, se recalcula aquí cada vez que cambia una línea. */
  const agregadoFiscal = agregarLineasFiscales(lineasFiscales);
  /** Aviso claro cuando el desglose no cuadra con el importe total (auditoría 12/09/2026) — nunca se guarda silenciosamente algo incompleto. */
  const validacionFiscal = validarLineasFiscales(lineasFiscales, parseFloat(String(importe).replace(',', '.')) || 0);

  const construirFactura = (): Factura => {
    const paginasImagen = paginas.filter(p => p.tipo === 'imagen');
    // Un único PDF subido directamente se conserva como el original de la
    // factura — nunca se mete en `imagen`/`imagenes` (que solo entienden
    // imágenes; un lector antiguo mostraría un icono roto si intentara
    // pintarlo con <img>). `paginas` sí guarda el orden real, mezclando
    // tipos, para los lectores nuevos que ya saben distinguirlos.
    const esSoloPdf = paginas.length > 0 && paginas.every(p => p.tipo === 'pdf');
    return {
      // En edición conservar id y fecha de creación originales
      id: facturaEditar?.id ?? uid(),
      tipo,
      fecha,
      concepto,
      importe: parseFloat(String(importe).replace(',', '.')) || 0,
      proveedor,
      proveedorId,
      // Cliente/proyecto se guardan en gastos Y en ingresos (10/09/2026) —
      // el backend sincroniza el Movimiento del proyecto para los dos tipos.
      clienteId: proyectoFijo?.clienteId || clienteId,
      proyectoId: proyectoFijo?.id || proyectoId,
      imagen: paginasImagen[0]?.dataUrl ?? (esSoloPdf ? '' : facturaEditar?.imagen ?? ''),
      imagenes: paginas.length ? paginasImagen.map(p => p.dataUrl) : facturaEditar?.imagenes ?? [],
      paginas: paginas.length
        ? paginas.map(p => ({ tipo: p.tipo, url: p.dataUrl }))
        : facturaEditar?.paginas ?? [],
      pdfOriginalUrl: esSoloPdf ? paginas[0].dataUrl : (paginas.length ? '' : facturaEditar?.pdfOriginalUrl ?? ''),
      origen: origen || facturaEditar?.origen || 'manual',
      numeroFactura: numeroFactura.trim(),
      cifNif: cifNif.trim(),
      categoria: categoria.trim(),
      // Desglose fiscal por tramos (auditoría 12/09/2026) — `baseImponible`/
      // `importeImpuesto` son SIEMPRE la suma de `lineasFiscales` cuando hay
      // alguna; `porcentajeImpuesto` solo tiene sentido con un único tramo
      // (con varios, ningún porcentaje suelto representa la factura entera).
      baseImponible: lineasFiscales.length > 0 ? agregadoFiscal.baseImponible : undefined,
      tipoImpuesto,
      porcentajeImpuesto: lineasFiscales.length === 1 ? lineasFiscales[0].porcentaje : undefined,
      importeImpuesto: lineasFiscales.length > 0 ? agregadoFiscal.importeImpuesto : undefined,
      lineasFiscales: lineasFiscales.length > 0 ? lineasFiscales : undefined,
      deducibleIrpf,
      deducibleIrpfOrigen,
      ivaIgicDeducible,
      ivaIgicDeducibleOrigen,
      hechosFiscales,
      categoriaFiscal,
      creado: facturaEditar?.creado ?? new Date().toISOString(),
    };
  };

  /**
   * Previsualización EN VIVO del tratamiento fiscal (Fase 3C.3) — con los
   * datos actuales del formulario, sin guardar nada: solo para que el
   * bloque "Tratamiento fiscal" pueda mostrar de inmediato lo que el motor
   * resolvería al pulsar "Guardar". La resolución real y definitiva la
   * escribe únicamente el backend, dentro de `guardarFactura()`.
   */
  const previsualizacionFiscal = tipo === 'gasto'
    ? resolverTratamientoFiscal(
      {
        tipo, categoriaFiscal,
        baseImponible: lineasFiscales.length > 0 ? agregadoFiscal.baseImponible : undefined,
        importe: parseFloat(String(importe).replace(',', '.')) || 0,
        tipoImpuesto,
        importeImpuesto: lineasFiscales.length > 0 ? agregadoFiscal.importeImpuesto : undefined,
        porcentajeImpuesto: lineasFiscales.length === 1 ? lineasFiscales[0].porcentaje : undefined,
        proveedor, concepto, categoria, hechosFiscales,
      },
      { repepActivo }
    )
    : null;
  const preguntaIrpf = previsualizacionFiscal?.preguntasFiscalesPendientes.find((p) => p.eje === 'irpf');
  const ejeIndirectoActivo = previsualizacionFiscal
    ? (previsualizacionFiscal.iva.estado !== 'no_aplica' ? previsualizacionFiscal.iva : previsualizacionFiscal.igic)
    : null;
  const preguntaIndirecto = previsualizacionFiscal?.preguntasFiscalesPendientes.find((p) => p.eje === 'iva' || p.eje === 'igic');

  /** Responde un hecho factual (Fase 3C.3) — se guarda el HECHO, nunca un porcentaje: lo traduce el motor al guardar. */
  const responderHechoFiscal = (hecho: HechoFiscalRequerido | undefined, respuesta: boolean) => {
    if (!hecho) return;
    setHechosFiscales((prev) => ({ ...prev, [hecho]: respuesta }));
  };

  /** `forzar: true` = el usuario ya vio el aviso de duplicado y quiere guardar igual. */
  const guardar = async (forzar = false) => {
    const f = construirFactura();
    if (!forzar) {
      setComprobandoDuplicado(true);
      try {
        const encontrada = await api.buscarFacturaDuplicada({
          numeroFactura: f.numeroFactura ?? '', cifNif: f.cifNif ?? '', proveedor: f.proveedor,
          fecha: f.fecha, importe: f.importe, excluirId: facturaEditar?.id,
        });
        if (encontrada) {
          setDuplicado(encontrada);
          setComprobandoDuplicado(false);
          return;
        }
      } catch {
        // Si falla la comprobación (red, etc.) no bloqueamos el guardado por eso.
      }
      setComprobandoDuplicado(false);
    }
    // Solo tiene sentido completar una ficha de PROVEEDOR (materiales, no
    // clientes) en un gasto — en un ingreso "la otra parte" es un cliente,
    // que no vive en absoluto en esta lista.
    const datosProveedorDetectados: DatosProveedorDetectados | undefined =
      tipo === 'gasto' && (direccionDetectada || codigoPostalDetectado || cifNif)
        ? { direccion: direccionDetectada, codigoPostal: codigoPostalDetectado, cifNif: cifNif.trim() }
        : undefined;
    onGuardar(f, datosProveedorDetectados);
  };

  const paginaActual = paginas[paginaVista];

  return (
    <div className={styles.modalFondo} onClick={onCerrar}>
      <div className={styles.modalCaja} style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalCabecera}>
          <h2 className={styles.h2} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {esEdicion ? (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z" /></svg>
            ) : (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>
            )}
            {esEdicion ? 'Editar factura' : 'Nueva factura'}
          </h2>
          <button className={styles.btnIcono} onClick={onCerrar} aria-label="Cerrar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* ── Botones de captura — el escáner de documento es la acción principal (estilo CamScanner: encuadre, ajuste de esquinas y varias hojas en un único documento); "Foto" y "Subir" quedan como alternativas secundarias, siempre disponibles. ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <button className={`${styles.btn} ${styles.btnPrimario}`}
              style={{ justifyContent: 'center', padding: '0.85rem', fontSize: '0.95rem', borderRadius: 12 }}
              onClick={() => setEscanerDocAbierto(true)}
              data-tutorial-id="factura-escanear-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6, verticalAlign: -3 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
              Escanear documento
            </button>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input ref={camaraRef} type="file" accept="image/*" capture="environment" multiple style={{ display: 'none' }}
                onChange={e => agregarArchivos(e.target.files, 'foto')} />
              <button className={`${styles.btn} ${styles.btnSecundario}`} style={{ flex: 1, justifyContent: 'center', minWidth: 80 }}
                onClick={() => camaraRef.current?.click()}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
                Foto rápida
              </button>
              <input ref={inputRef} type="file" accept="image/*,application/pdf" multiple style={{ display: 'none' }}
                onChange={e => agregarArchivos(e.target.files)} />
              <button className={`${styles.btn} ${styles.btnSecundario}`} style={{ flex: 1, justifyContent: 'center', minWidth: 80 }}
                onClick={() => inputRef.current?.click()}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                Subir
              </button>
            </div>
          </div>

          {/* Escáner de documento modal */}
          {escanerDocAbierto && (
            <EscanerDocumento
              onCerrar={() => setEscanerDocAbierto(false)}
              onConfirmar={onDocumentoEscaneado}
            />
          )}

          {/* ── Visor multihoja ── */}
          {paginas.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>

              {/* Miniaturas de páginas */}
              <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
                {paginas.map((p, i) => (
                  <div key={p.id}
                    onClick={() => setPaginaVista(i)}
                    style={{ position: 'relative', flexShrink: 0, cursor: 'pointer',
                      border: `2px solid ${i === paginaVista ? 'var(--topo)' : 'var(--borde)'}`,
                      borderRadius: 6, overflow: 'hidden', width: 54, height: 72,
                      background: 'var(--fondo-caja)',
                    }}
                  >
                    {p.tipo === 'pdf' ? (
                      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, color: 'var(--topo)' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                        <span style={{ fontSize: '0.55rem', fontWeight: 700 }}>PDF</span>
                      </div>
                    ) : (
                      <img src={urlImagenFiable(p.dataUrl)} alt={`Hoja ${i + 1}`}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    )}
                    <span style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
                      background: i === paginaVista ? 'var(--topo)' : 'rgba(0,0,0,0.45)',
                      color: 'var(--blanco)', fontSize: '0.6rem', textAlign: 'center', padding: '1px 0', fontWeight: 700 }}>
                      {i + 1}
                    </span>
                  </div>
                ))}
                {/* Botón añadir hoja */}
                <button
                  onClick={() => inputRef.current?.click()}
                  style={{ flexShrink: 0, width: 54, height: 72, border: '2px dashed var(--borde)',
                    borderRadius: 6, background: 'transparent', cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--topo-claro)', fontSize: '1.2rem', gap: '2px' }}
                  title="Añadir hoja">
                  <span>＋</span>
                  <span style={{ fontSize: '0.55rem', fontWeight: 600, letterSpacing: '0.02em' }}>HOJA</span>
                </button>
              </div>

              {/* Vista previa de la hoja seleccionada */}
              {paginaActual && (
                <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--borde)', background: 'var(--fondo-caja)' }}>
                  {paginaActual.tipo === 'pdf' ? (
                    <iframe src={urlImagenFiable(paginaActual.dataUrl)} title={`Vista previa PDF — Hoja ${paginaVista + 1}`}
                      style={{ width: '100%', height: 220, border: 'none', display: 'block' }} />
                  ) : (
                    <img src={urlImagenFiable(paginaActual.dataUrl)} alt={`Hoja ${paginaVista + 1}`}
                      style={{ width: '100%', maxHeight: 180, objectFit: 'contain', display: 'block' }} />
                  )}
                  {/* Controles de la hoja activa */}
                  <div style={{ display: 'flex', gap: '0.35rem', padding: '0.4rem 0.5rem',
                    background: 'rgba(248,246,242,0.95)', borderTop: '1px solid var(--borde-fino)',
                    justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--topo-claro)', fontWeight: 600 }}>
                      Hoja {paginaVista + 1} / {paginas.length}
                    </span>
                    <div style={{ display: 'flex', gap: '0.3rem' }}>
                      {paginaActual.tipo === 'imagen' && (
                        <button onClick={() => rotarPagina(paginaActual.id, 1)} disabled={rotando}
                          className={styles.btnIcono} title="Rotar 90°" aria-label="Rotar hoja 90 grados" style={{ opacity: rotando ? 0.4 : 1 }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3.5-7.11" /><polyline points="21 3 21 9 15 9" /></svg>
                        </button>
                      )}
                      <button onClick={() => moverPagina(paginaActual.id, -1)} disabled={paginaVista === 0}
                        className={styles.btnIcono} title="Mover antes" aria-label="Mover hoja antes" style={{ opacity: paginaVista === 0 ? 0.3 : 1 }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                      </button>
                      <button onClick={() => moverPagina(paginaActual.id, 1)} disabled={paginaVista === paginas.length - 1}
                        className={styles.btnIcono} title="Mover después" aria-label="Mover hoja después" style={{ opacity: paginaVista === paginas.length - 1 ? 0.3 : 1 }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                      </button>
                      <button onClick={() => quitarPagina(paginaActual.id)}
                        className={styles.btnIcono} title="Quitar hoja" aria-label="Quitar hoja" style={{ color: 'var(--rojo)' }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Extracción con IA — solo tiene sentido con al menos una página de imagen (el perfil vision no lee PDF).
                  Oculto a propósito (12/08/2026): el perfil `vision` de esta capacidad solo tiene OpenAI como
                  candidato y el usuario no tiene suscripción/acceso de pago todavía — el código se deja intacto,
                  listo para reactivarse cambiando `IA_FACTURA_DISPONIBLE` a `true` el día que haya un modelo de
                  visión disponible (OpenAI u otro) sin riesgo de coste inesperado. */}
              {IA_FACTURA_DISPONIBLE && paginas.some(p => p.tipo === 'imagen') && (
                tienePlanIA ? (
                  <button
                    className={`${styles.btn} ${styles.btnSecundario}`}
                    style={{ width: '100%', justifyContent: 'center', marginTop: '0.5rem' }}
                    onClick={extraerConIA}
                    disabled={extrayendo}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6, verticalAlign: -2 }}><path d="M12 2a10 10 0 1 0 10 10" /><path d="M12 2v10l7-3" /></svg>
                    {extrayendo ? 'Leyendo la factura…' : 'Extraer datos con IA'}
                  </button>
                ) : (
                  // Fase 2.5 (04/09/2026): la extracción con IA exige PRO+ en el servidor —
                  // rellenar los campos a mano sigue funcionando igual, sin ningún gate.
                  <button
                    className={`${styles.btn} ${styles.btnSecundario}`}
                    disabled
                    title="Extraer datos con IA requiere el plan PRO o superior"
                    style={{ width: '100%', justifyContent: 'center', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: 0.7, cursor: 'not-allowed' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 10 10" /><path d="M12 2v10l7-3" /></svg>
                    Extraer datos con IA <CandadoPlan planMinimo="PRO" compacto />
                  </button>
                )
              )}
              {confianzaIA && (
                <p style={{ margin: '0.4rem 0 0', fontSize: '0.72rem', color: confianzaIA === 'alta' ? 'var(--verde)' : confianzaIA === 'media' ? 'var(--ocre)' : 'var(--rojo)' }}>
                  Confianza de la lectura: {confianzaIA}. Revisa los campos antes de guardar.
                </p>
              )}
              {avisoRevisarEmisor && (
                <p style={{ margin: '0.4rem 0 0', fontSize: '0.72rem', color: 'var(--rojo)', fontWeight: 600 }}>
                  No se ha podido verificar automáticamente quién es Madera Creativa en este documento — comprueba el tipo (ingreso/gasto) y el campo "Proveedor/Cliente" antes de guardar.
                </p>
              )}
              {errorExtraccion && (
                <p style={{ margin: '0.4rem 0 0', fontSize: '0.72rem', color: 'var(--rojo)' }}>{errorExtraccion}</p>
              )}
            </div>
          )}

          {/* Tipo */}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className={`${styles.btn} ${tipo === 'ingreso' ? styles.btnVerde : styles.btnSecundario}`}
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => setTipo('ingreso')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></svg>
              Ingreso
            </button>
            <button
              className={`${styles.btn} ${tipo === 'gasto' ? styles.btnPeligro : styles.btnSecundario}`}
              style={{ flex: 1, justifyContent: 'center', color: tipo === 'gasto' ? 'var(--rojo)' : undefined }}
              onClick={() => setTipo('gasto')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>
              Gasto
            </button>
          </div>

          <label className={styles.label}>Fecha
            <input className={styles.input} type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </label>

          <label className={styles.label}>Importe (€)
            <ImporteInput value={importe} onChange={setImporte} placeholder="0,00" />
          </label>

          {/*
           * Etiqueta según el tipo (10/09/2026, reporte real del usuario):
           * en una factura de INGRESO que emite él, la otra parte del
           * documento es su CLIENTE, no un "proveedor/emisor" — ver que
           * ponía "Emisor: <nombre del cliente>" le hacía pensar que la IA
           * se había equivocado. El emisor en un ingreso es siempre Madera
           * Creativa (se muestra debajo, en solo lectura, desde Ajustes de
           * empresa). El dato que sí se guarda aquí es el del cliente,
           * porque el libro de facturas emitidas y el asesor lo necesitan.
           */}
          <label className={styles.label}>
            {tipo === 'ingreso' ? 'Cliente' : tipo === 'gasto' ? 'Proveedor' : 'Proveedor / Cliente'}
            <div style={{ position: 'relative' }}>
              <input
                className={styles.input}
                type="text"
                placeholder={tipo === 'ingreso' ? 'Nombre del cliente' : 'Nombre del proveedor'}
                value={proveedor}
                onChange={(e) => {
                  const texto = e.target.value;
                  setProveedor(texto);
                  // No basta con borrar el vínculo a la primera tecla: si el
                  // usuario solo está retocando una mayúscula, una tilde o
                  // un "S.L." de más, el nombre resultante puede seguir
                  // siendo el mismo proveedor ya registrado. Hallazgo real
                  // del usuario, 03/09/2026: borrar `proveedorId` sin más
                  // aquí creaba una ficha de proveedor duplicada al guardar
                  // (`autoCrearProveedorDeFactura`, que a su vez ya no
                  // reconocía el vínculo). Recalcula con la misma
                  // coincidencia tolerante que usa la detección por IA —
                  // solo queda vacío si de verdad no hay ningún proveedor
                  // conocido que se le parezca.
                  const conocido = proveedores.find((p) => nombresCoinciden(p.nombre, texto));
                  setProveedorId(conocido?.id ?? '');
                  setMostrarSugerencias(true);
                }}
                onFocus={() => setMostrarSugerencias(true)}
                onBlur={() => setTimeout(() => setMostrarSugerencias(false), 150)}
                autoComplete="off"
              />
              {/* Desplegable de proveedores existentes — solo en gastos: en un
                  ingreso esta lista (proveedores de material) no viene a cuento. */}
              {mostrarSugerencias && tipo !== 'ingreso' && proveedores.length > 0 && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0,
                  background: 'var(--blanco)', border: '1px solid var(--borde)', borderRadius: 8,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: Z_DESPLEGABLE,
                  maxHeight: 180, overflowY: 'auto',
                }}>
                  {proveedores
                    .filter(p => !proveedor.trim() || p.nombre.toLowerCase().includes(proveedor.toLowerCase()))
                    .map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onMouseDown={() => { setProveedor(p.nombre); setProveedorId(p.id); if (p.cifNif) setCifNif(p.cifNif); setMostrarSugerencias(false); }}
                        style={{
                          width: '100%', textAlign: 'left', background: 'none', border: 'none',
                          padding: '0.55rem 0.85rem', cursor: 'pointer', fontSize: '0.85rem',
                          color: 'var(--negro)', display: 'flex', alignItems: 'center', gap: '0.5rem',
                          borderBottom: '1px solid var(--borde-fino)',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--fondo-caja)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: 'var(--topo-muy-claro)' }}><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /></svg>
                        <span style={{ fontWeight: 600 }}>{p.nombre}</span>
                        {p.contacto && <span style={{ fontSize: '0.72rem', color: 'var(--topo-claro)', marginLeft: 'auto' }}>{p.contacto}</span>}
                      </button>
                    ))
                  }
                  {proveedores.filter(p => !proveedor.trim() || p.nombre.toLowerCase().includes(proveedor.toLowerCase())).length === 0 && (
                    <p style={{ margin: 0, padding: '0.6rem 0.85rem', fontSize: '0.78rem', color: 'var(--topo-claro)' }}>Sin proveedores — se creará uno nuevo al guardar</p>
                  )}
                </div>
              )}
            </div>
          </label>

          {/* En un ingreso, el emisor eres tú: se muestra en solo lectura
              desde Ajustes de empresa, sin volver a pedirlo en cada factura. */}
          {tipo === 'ingreso' && (
            <p style={{ margin: '-0.35rem 0 0', fontSize: '0.76rem', color: 'var(--topo-claro)', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M20 6L9 17l-5-5" /></svg>
              {empresa && (empresa.nombre || empresa.titular || empresa.nifCif) ? (
                <span>Emisor: <strong>{empresa.titular || empresa.nombre}</strong>{empresa.nifCif ? ` · ${empresa.nifCif}` : ''}</span>
              ) : (
                <span>Emisor: tú. Completa tu nombre y NIF en <strong>Ajustes de empresa</strong> para que salgan en la documentación del asesor.</span>
              )}
            </p>
          )}

          <label className={styles.label}>Concepto
            <input className={styles.input} type="text" placeholder="Descripción de la factura" value={concepto} onChange={(e) => setConcepto(e.target.value)} />
          </label>

          {tipo === 'gasto' && proyectoFijo && (
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--topo-claro)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
              Este gasto se vinculará al proyecto: <strong>{proyectoFijo.nombre}</strong>
            </p>
          )}

          {/* Vincular a cliente/proyecto — también en INGRESOS (10/09/2026,
              reporte del usuario: "no puedo relacionar ese ingreso con un
              cliente"). Un ingreso ligado a un cliente+proyecto aparece como
              tal en el "Control de gasto" de ese proyecto y cuenta en su
              margen — el backend ya lo soporta para los dos tipos
              (`sincronizarMovimientoFactura`). */}
          {(tipo === 'gasto' || tipo === 'ingreso') && !proyectoFijo && clientes.length > 0 && (
            <>
              <label className={styles.label}>Vincular a cliente (opcional)
                <select className={styles.select} value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
                  <option value="">Sin cliente</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </label>
              {/*
               * Selector de proyecto — solo aparece con un cliente elegido
               * que tenga algún proyecto. Con 2+ proyectos NUNCA se
               * preselecciona ninguno (incremento "Cliente ≠ Proyecto",
               * 20/08/2026): es preferible una factura pendiente de
               * vincular a un proyecto concreto que vinculada al que no
               * es. El aviso de abajo deja claro qué va a pasar si se
               * deja sin elegir.
               */}
              {clienteId && proyectosDelCliente.length > 0 && (
                <label className={styles.label}>Proyecto {proyectosDelCliente.length > 1 ? '*' : '(opcional)'}
                  <select className={styles.select} value={proyectoId} onChange={(e) => setProyectoId(e.target.value)}>
                    <option value="">{proyectosDelCliente.length > 1 ? 'Selecciona un proyecto…' : 'Sin proyecto'}</option>
                    {proyectosDelCliente.map((p) => (
                      <option key={p.id} value={p.id}>{p.proyecto || 'Proyecto sin nombre'} — {etiquetaEstado[p.estado as keyof typeof etiquetaEstado] ?? p.estado}</option>
                    ))}
                  </select>
                </label>
              )}
              {clienteId && proyectosDelCliente.length > 1 && !proyectoId && (
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--ocre, #a67c00)' }}>
                  Este cliente tiene varios proyectos — si no eliges uno, la factura se guardará sin vincular a ningún proyecto (nunca se adivina cuál).
                </p>
              )}
              {clienteId && proyectosDelCliente.length === 0 && (
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--topo-claro)' }}>Este cliente todavía no tiene ningún proyecto.</p>
              )}
            </>
          )}

          <button type="button" className={styles.btn} style={{ alignSelf: 'flex-start', fontSize: '0.78rem', padding: '0.35rem 0' }}
            onClick={() => setDatosFiscalesAbierto((v) => !v)}>
            {datosFiscalesAbierto ? '− Ocultar' : '+ Añadir'} datos fiscales (nº factura, NIF, impuesto…)
          </button>
          {datosFiscalesAbierto && (
            <div style={{ background: 'var(--fondo-caja)', border: '1px solid var(--borde)', borderRadius: 8, padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <label className={styles.label} style={{ flex: '1 1 120px', minWidth: 0 }}>Nº factura
                  <input className={styles.input} style={{ width: '100%', boxSizing: 'border-box' }} value={numeroFactura} onChange={(e) => setNumeroFactura(e.target.value)} />
                </label>
                <label className={styles.label} style={{ flex: '1 1 120px', minWidth: 0 }}>
                  {tipo === 'ingreso' ? 'NIF del cliente' : tipo === 'gasto' ? 'NIF del proveedor' : 'CIF/NIF'}
                  <input className={styles.input} style={{ width: '100%', boxSizing: 'border-box' }} value={cifNif} onChange={(e) => setCifNif(e.target.value)} />
                </label>
              </div>
              <label className={styles.label}>Categoría
                <input className={styles.input} value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="materiales, herramientas, combustible…" />
              </label>
              <label className={styles.label}>Tipo de impuesto (general de la factura)
                <select
                  className={styles.select}
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  value={tipoImpuesto}
                  onChange={(e) => setTipoImpuesto(e.target.value as TipoImpuestoFactura)}
                >
                  <option value="">Sin especificar</option>
                  <option value="iva">IVA</option>
                  <option value="igic">IGIC</option>
                  <option value="exento">Exento</option>
                  <option value="sin_impuesto">Sin impuesto</option>
                </select>
              </label>

              {/* Desglose por tramos (auditoría 12/09/2026) — una factura puede tener varias bases/cuotas del
                  mismo impuesto a distinto porcentaje (p. ej. 3% y 7% de IGIC en el mismo documento); cada
                  tramo se edita, añade y elimina por separado, nunca se colapsan en un único campo. */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--topo)' }}>Desglose de IVA/IGIC</span>
                {lineasFiscales.map((linea) => (
                  <div key={linea.id} style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <label className={styles.label} style={{ flex: '1 1 100px', minWidth: 0 }}>Tipo
                      <select
                        className={styles.select} style={{ width: '100%', boxSizing: 'border-box' }}
                        value={linea.tipo}
                        onChange={(e) => setLineasFiscales((prev) => prev.map((l) => (l.id === linea.id ? { ...l, tipo: e.target.value as TipoLineaFiscal } : l)))}
                      >
                        <option value="iva">IVA</option>
                        <option value="igic">IGIC</option>
                        <option value="exento">Exento</option>
                        <option value="sin_impuesto">Sin impuesto</option>
                      </select>
                    </label>
                    <label className={styles.label} style={{ flex: '1 1 70px', minWidth: 0 }}>%
                      <input
                        className={styles.input} style={{ width: '100%', boxSizing: 'border-box' }} type="number"
                        value={linea.porcentaje} onChange={(e) => setLineasFiscales((prev) => prev.map((l) => (l.id === linea.id ? { ...l, porcentaje: parseFloat(e.target.value.replace(',', '.')) || 0 } : l)))}
                        disabled={linea.tipo === 'exento' || linea.tipo === 'sin_impuesto'}
                      />
                    </label>
                    <label className={styles.label} style={{ flex: '1 1 90px', minWidth: 0 }}>Base (€)
                      <input
                        className={styles.input} style={{ width: '100%', boxSizing: 'border-box' }} type="number"
                        value={linea.baseImponible} onChange={(e) => setLineasFiscales((prev) => prev.map((l) => (l.id === linea.id ? { ...l, baseImponible: parseFloat(e.target.value.replace(',', '.')) || 0 } : l)))}
                      />
                    </label>
                    <label className={styles.label} style={{ flex: '1 1 90px', minWidth: 0 }}>Cuota (€)
                      <input
                        className={styles.input} style={{ width: '100%', boxSizing: 'border-box' }} type="number"
                        value={linea.cuota} onChange={(e) => setLineasFiscales((prev) => prev.map((l) => (l.id === linea.id ? { ...l, cuota: parseFloat(e.target.value.replace(',', '.')) || 0 } : l)))}
                        disabled={linea.tipo === 'exento' || linea.tipo === 'sin_impuesto'}
                      />
                    </label>
                    <button
                      type="button" className={styles.btnIcono} title="Quitar este tramo" aria-label="Quitar este tramo"
                      style={{ color: 'var(--rojo)', marginBottom: '0.35rem' }}
                      onClick={() => setLineasFiscales((prev) => prev.filter((l) => l.id !== linea.id))}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                    </button>
                  </div>
                ))}
                <button
                  type="button" className={`${styles.btn} ${styles.btnSecundario}`}
                  style={{ alignSelf: 'flex-start', fontSize: '0.76rem' }}
                  onClick={() => setLineasFiscales((prev) => [...prev, {
                    id: uid(),
                    tipo: (tipoImpuesto === 'iva' || tipoImpuesto === 'igic' || tipoImpuesto === 'exento' || tipoImpuesto === 'sin_impuesto') ? tipoImpuesto : 'igic',
                    porcentaje: 0, baseImponible: 0, cuota: 0,
                  }])}
                >
                  + Añadir tramo
                </button>
                {lineasFiscales.length > 0 && (
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--topo)' }}>
                    Base total: <strong>{agregadoFiscal.baseImponible.toFixed(2)}€</strong> · Impuesto total: <strong>{agregadoFiscal.importeImpuesto.toFixed(2)}€</strong>
                  </p>
                )}
                {!validacionFiscal.valido && (
                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--ocre, #a67c00)' }}>{validacionFiscal.motivo}</p>
                )}
              </div>

              {/* Tratamiento fiscal (Fase 3B, automatizado en 3C.3) — solo gastos. El motor resuelve lo que puede con
                  seguridad; si falta un hecho, se pregunta ESE hecho, nunca un porcentaje; el selector manual de
                  siempre queda como último recurso, nunca como paso obligatorio. */}
              {tipo === 'gasto' && (
                <div style={{ marginTop: '0.2rem', paddingTop: '0.65rem', borderTop: '1px solid var(--borde)', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 700, color: 'var(--negro)' }}>Tratamiento fiscal</p>
                  <TratamientoFiscalEje
                    etiqueta="¿Este gasto es deducible en IRPF?"
                    valor={deducibleIrpf}
                    origen={deducibleIrpfOrigen}
                    resolucion={previsualizacionFiscal?.irpf ?? null}
                    pregunta={preguntaIrpf}
                    onCambiarValor={(v) => { setDeducibleIrpf(v); setDeducibleIrpfOrigen(v === undefined ? undefined : 'usuario'); }}
                    onResponderHecho={(respuesta) => responderHechoFiscal(previsualizacionFiscal?.irpf.preguntaId, respuesta)}
                  />
                  {estadoIvaIgicDeducible({
                    tipo,
                    tipoImpuesto,
                    importeImpuesto: lineasFiscales.length > 0 ? agregadoFiscal.importeImpuesto : undefined,
                    baseImponible: lineasFiscales.length > 0 ? agregadoFiscal.baseImponible : undefined,
                    porcentajeImpuesto: lineasFiscales.length === 1 ? lineasFiscales[0].porcentaje : undefined,
                    ivaIgicDeducible,
                  }) !== 'no_aplica' && (
                    <TratamientoFiscalEje
                      etiqueta="¿El IVA/IGIC soportado es deducible?"
                      valor={ivaIgicDeducible}
                      origen={ivaIgicDeducibleOrigen}
                      resolucion={ejeIndirectoActivo}
                      pregunta={preguntaIndirecto}
                      onCambiarValor={(v) => { setIvaIgicDeducible(v); setIvaIgicDeducibleOrigen(v === undefined ? undefined : 'usuario'); }}
                      onResponderHecho={(respuesta) => responderHechoFiscal(ejeIndirectoActivo?.preguntaId, respuesta)}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {duplicado && (
            <div className={styles.loginError} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <span>
                Ya hay una factura muy parecida guardada: <strong>{duplicado.concepto || duplicado.proveedor || 'sin concepto'}</strong> del {duplicado.fecha} por {duplicado.importe.toFixed(2)}€.
                ¿Seguro que quieres guardar esta también?
              </span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className={`${styles.btn} ${styles.btnSecundario}`} style={{ fontSize: '0.78rem' }} onClick={() => setDuplicado(null)}>
                  Revisar, no guardar
                </button>
                <button className={`${styles.btn} ${styles.btnPeligro}`} style={{ fontSize: '0.78rem' }} onClick={() => guardar(true)}>
                  Guardar de todas formas
                </button>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={onCerrar} style={{ flex: 1, justifyContent: 'center' }}>
              Cancelar
            </button>
            <button
              className={`${styles.btn} ${styles.btnPrimario}`}
              style={{ flex: 2, justifyContent: 'center' }}
              disabled={!importe || parseFloat(String(importe).replace(',', '.')) <= 0 || comprobandoDuplicado}
              onClick={() => guardar(false)}
            >
              {comprobandoDuplicado ? 'Comprobando…' : esEdicion ? 'Guardar cambios' : 'Guardar factura'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
