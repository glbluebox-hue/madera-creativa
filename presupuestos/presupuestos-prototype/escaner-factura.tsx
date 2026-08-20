import { useState, useRef, useEffect } from 'react';
import type { Factura, Proveedor } from './types.js';
import { EscanerDocumento } from './escaner-documento.js';
import type { ResultadoEscaneo } from './escaner-documento.js';
import { ImporteInput } from './importe-input.js';
import { leerArchivoComoBase64 } from './archivos.js';
import { comprimirImagen } from './procesamiento-imagenes.js';
import { Z_DESPLEGABLE } from './z-index.js';
import { etiquetaEstado } from './estado-utils.js';
import * as api from './api.js';
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
  /** Callback al guardar la factura procesada. */
  onGuardar: (f: Factura) => void;
  /** Callback al cerrar sin guardar. */
  onCerrar: () => void;
  /** Factura existente para editar (si se pasa, el modal abre en modo edición). */
  facturaEditar?: Factura;
};

/** Una página del documento escaneado — puede ser una imagen o un PDF subido directamente. */
type Pagina = { id: string; dataUrl: string; nombre: string; tipo: 'imagen' | 'pdf' };

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
 * Modal para añadir facturas manualmente o con captura de imagen.
 * Soporta múltiples hojas/páginas que se combinan como un único documento.
 */
export function EscanerFactura({ clientes, proveedores = [], proyectoFijo, onGuardar, onCerrar, facturaEditar }: EscanerFacturaProps) {
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
  const [baseImponible, setBaseImponible] = useState(facturaEditar?.baseImponible ? String(facturaEditar.baseImponible) : '');
  const [porcentajeImpuesto, setPorcentajeImpuesto] = useState(facturaEditar?.porcentajeImpuesto ? String(facturaEditar.porcentajeImpuesto) : '');
  const [importeImpuesto, setImporteImpuesto] = useState(facturaEditar?.importeImpuesto ? String(facturaEditar.importeImpuesto) : '');
  const [datosFiscalesAbierto, setDatosFiscalesAbierto] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const camaraRef = useRef<HTMLInputElement>(null);
  const [escanerDocAbierto, setEscanerDocAbierto] = useState(false);

  // ── Extracción de datos con IA (Fase Facturas Profesional) ──
  const [extrayendo, setExtrayendo] = useState(false);
  const [errorExtraccion, setErrorExtraccion] = useState<string | null>(null);
  const [confianzaIA, setConfianzaIA] = useState<'alta' | 'media' | 'baja' | null>(null);

  const extraerConIA = async () => {
    const paginaImagen = paginas.find((p) => p.tipo === 'imagen');
    if (!paginaImagen) return;
    setExtrayendo(true);
    setErrorExtraccion(null);
    setConfianzaIA(null);
    try {
      const resp = await api.generarRespuestaIA({
        capacidad: 'extraer-datos-factura',
        mensajes: [{ role: 'user', content: 'Extrae los datos de esta factura.', imagenes: [paginaImagen.dataUrl] }],
      });
      const limpio = resp.respuesta.trim().replace(/^```json\s*|```$/g, '');
      const datos = JSON.parse(limpio);
      // La IA propone — solo rellena los campos, el usuario debe revisar y
      // pulsar "Guardar factura" para confirmar. Nunca sobrescribe con
      // `null` lo que el usuario ya hubiera escrito a mano.
      if (datos.proveedor) { setProveedor(datos.proveedor); setProveedorId(''); }
      if (datos.cifNif) setCifNif(datos.cifNif);
      if (datos.numeroFactura) setNumeroFactura(datos.numeroFactura);
      if (datos.fecha) setFecha(datos.fecha);
      if (typeof datos.baseImponible === 'number') setBaseImponible(String(datos.baseImponible));
      if (typeof datos.porcentajeImpuesto === 'number') setPorcentajeImpuesto(String(datos.porcentajeImpuesto));
      if (typeof datos.importeImpuesto === 'number') setImporteImpuesto(String(datos.importeImpuesto));
      if (typeof datos.importe === 'number') setImporte(String(datos.importe));
      if (datos.concepto) setConcepto(datos.concepto);
      if (datos.tipo === 'ingreso' || datos.tipo === 'gasto') setTipo(datos.tipo);
      if (datos.categoria) setCategoria(datos.categoria);
      if (datos.baseImponible || datos.porcentajeImpuesto) setDatosFiscalesAbierto(true);
      setConfianzaIA(datos.confianza ?? null);
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

  const guardar = () => {
    const paginasImagen = paginas.filter(p => p.tipo === 'imagen');
    // Un único PDF subido directamente se conserva como el original de la
    // factura — nunca se mete en `imagen`/`imagenes` (que solo entienden
    // imágenes; un lector antiguo mostraría un icono roto si intentara
    // pintarlo con <img>). `paginas` sí guarda el orden real, mezclando
    // tipos, para los lectores nuevos que ya saben distinguirlos.
    const esSoloPdf = paginas.length > 0 && paginas.every(p => p.tipo === 'pdf');
    const f: Factura = {
      // En edición conservar id y fecha de creación originales
      id: facturaEditar?.id ?? uid(),
      tipo,
      fecha,
      concepto,
      importe: parseFloat(String(importe).replace(',', '.')) || 0,
      proveedor,
      proveedorId,
      clienteId: tipo === 'gasto' ? (proyectoFijo?.clienteId || clienteId) : '',
      proyectoId: tipo === 'gasto' ? (proyectoFijo?.id || proyectoId) : '',
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
      baseImponible: baseImponible ? parseFloat(baseImponible.replace(',', '.')) : undefined,
      porcentajeImpuesto: porcentajeImpuesto ? parseFloat(porcentajeImpuesto.replace(',', '.')) : undefined,
      importeImpuesto: importeImpuesto ? parseFloat(importeImpuesto.replace(',', '.')) : undefined,
      creado: facturaEditar?.creado ?? new Date().toISOString(),
    };
    onGuardar(f);
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
              onClick={() => setEscanerDocAbierto(true)}>
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
                      background: 'var(--fondo)',
                    }}
                  >
                    {p.tipo === 'pdf' ? (
                      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, color: 'var(--topo)' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                        <span style={{ fontSize: '0.55rem', fontWeight: 700 }}>PDF</span>
                      </div>
                    ) : (
                      <img src={p.dataUrl} alt={`Hoja ${i + 1}`}
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
                <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--borde)', background: 'var(--fondo)' }}>
                  {paginaActual.tipo === 'pdf' ? (
                    <iframe src={paginaActual.dataUrl} title={`Vista previa PDF — Hoja ${paginaVista + 1}`}
                      style={{ width: '100%', height: 220, border: 'none', display: 'block' }} />
                  ) : (
                    <img src={paginaActual.dataUrl} alt={`Hoja ${paginaVista + 1}`}
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
                <button
                  className={`${styles.btn} ${styles.btnSecundario}`}
                  style={{ width: '100%', justifyContent: 'center', marginTop: '0.5rem' }}
                  onClick={extraerConIA}
                  disabled={extrayendo}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6, verticalAlign: -2 }}><path d="M12 2a10 10 0 1 0 10 10" /><path d="M12 2v10l7-3" /></svg>
                  {extrayendo ? 'Leyendo la factura…' : 'Extraer datos con IA'}
                </button>
              )}
              {confianzaIA && (
                <p style={{ margin: '0.4rem 0 0', fontSize: '0.72rem', color: confianzaIA === 'alta' ? 'var(--verde)' : confianzaIA === 'media' ? 'var(--ocre)' : 'var(--rojo)' }}>
                  Confianza de la lectura: {confianzaIA}. Revisa los campos antes de guardar.
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

          <label className={styles.label}>Proveedor / Emisor
            <div style={{ position: 'relative' }}>
              <input
                className={styles.input}
                type="text"
                placeholder="Nombre del proveedor"
                value={proveedor}
                onChange={(e) => { setProveedor(e.target.value); setProveedorId(''); setMostrarSugerencias(true); }}
                onFocus={() => setMostrarSugerencias(true)}
                onBlur={() => setTimeout(() => setMostrarSugerencias(false), 150)}
                autoComplete="off"
              />
              {/* Desplegable de proveedores existentes */}
              {mostrarSugerencias && proveedores.length > 0 && (
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
                        onMouseDown={() => { setProveedor(p.nombre); setProveedorId(p.id); setMostrarSugerencias(false); }}
                        style={{
                          width: '100%', textAlign: 'left', background: 'none', border: 'none',
                          padding: '0.55rem 0.85rem', cursor: 'pointer', fontSize: '0.85rem',
                          color: 'var(--negro)', display: 'flex', alignItems: 'center', gap: '0.5rem',
                          borderBottom: '1px solid var(--borde-fino)',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--fondo)')}
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

          <label className={styles.label}>Concepto
            <input className={styles.input} type="text" placeholder="Descripción de la factura" value={concepto} onChange={(e) => setConcepto(e.target.value)} />
          </label>

          {tipo === 'gasto' && proyectoFijo && (
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--topo-claro)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
              Este gasto se vinculará al proyecto: <strong>{proyectoFijo.nombre}</strong>
            </p>
          )}

          {tipo === 'gasto' && !proyectoFijo && clientes.length > 0 && (
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
                  Este cliente tiene varios proyectos — si no eliges uno, el gasto se guardará sin vincular a ningún proyecto (nunca se adivina cuál).
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
            <div style={{ background: 'var(--fondo)', border: '1px solid var(--borde)', borderRadius: 8, padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <label className={styles.label} style={{ flex: 1 }}>Nº factura
                  <input className={styles.input} value={numeroFactura} onChange={(e) => setNumeroFactura(e.target.value)} />
                </label>
                <label className={styles.label} style={{ flex: 1 }}>CIF/NIF
                  <input className={styles.input} value={cifNif} onChange={(e) => setCifNif(e.target.value)} />
                </label>
              </div>
              <label className={styles.label}>Categoría
                <input className={styles.input} value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="materiales, herramientas, combustible…" />
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <label className={styles.label} style={{ flex: 1 }}>Base imponible (€)
                  <input className={styles.input} type="number" value={baseImponible} onChange={(e) => setBaseImponible(e.target.value)} />
                </label>
                <label className={styles.label} style={{ flex: 1 }}>Impuesto (%)
                  <input className={styles.input} type="number" value={porcentajeImpuesto} onChange={(e) => setPorcentajeImpuesto(e.target.value)} />
                </label>
                <label className={styles.label} style={{ flex: 1 }}>Cuota impuesto (€)
                  <input className={styles.input} type="number" value={importeImpuesto} onChange={(e) => setImporteImpuesto(e.target.value)} />
                </label>
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
              disabled={!importe || parseFloat(String(importe).replace(',', '.')) <= 0}
              onClick={guardar}
            >
              {esEdicion ? 'Guardar cambios' : 'Guardar factura'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
