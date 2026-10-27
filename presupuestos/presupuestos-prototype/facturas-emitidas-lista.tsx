import { useState, useEffect, useCallback } from 'react';
import * as api from './api.js';
import type { FacturaEmitida, LineaFacturaEmitida } from './api.js';
import { formatoEuro, formatoFecha } from './calculos.js';
import { ConfirmarBorrado } from './confirmar-borrado.js';
import styles from './styles.module.css';

export type FacturasEmitidasListaProps = {
  /** Lista ligera de clientes — para el selector y el nombre en cada fila. */
  clientes: { id: string; nombre: string }[];
};

const ETIQUETA_ESTADO: Record<string, string> = { borrador: 'Borrador', emitida: 'Emitida', anulada: 'Anulada' };
const COLOR_ESTADO: Record<string, string> = { borrador: 'var(--topo-claro)', emitida: 'var(--verde)', anulada: 'var(--rojo)' };

function nuevaLinea(): LineaFacturaEmitida {
  return { id: Math.random().toString(36).slice(2), concepto: '', precio: 0, cantidad: 1 };
}

const METODOS_PAGO = ['Efectivo', 'Transferencia bancaria', 'Tarjeta', 'Al contado'];

/**
 * Selector de método de pago (petición del usuario, 27/10/2026): una
 * lista de opciones en vez de texto libre cada vez, con "Otro…" para un
 * caso no previsto. Si eligen "Transferencia bancaria", el PDF añade solo
 * el IBAN ya guardado en Ajustes de empresa — aquí solo se guarda la
 * etiqueta, nunca el IBAN (ver `textoMetodoPago` en
 * `factura-emitida-pdf.service.ts`).
 */
function SelectorMetodoPago({ valor, onCambiar }: { valor: string; onCambiar: (v: string) => void }) {
  const [otro, setOtro] = useState(() => valor !== '' && !METODOS_PAGO.includes(valor));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
      <select
        className={styles.select}
        value={otro ? '__otro__' : valor}
        onChange={(e) => {
          if (e.target.value === '__otro__') { setOtro(true); onCambiar(''); }
          else { setOtro(false); onCambiar(e.target.value); }
        }}
        style={{ width: '100%' }}
      >
        <option value="">Selecciona…</option>
        {METODOS_PAGO.map((m) => <option key={m} value={m}>{m}</option>)}
        <option value="__otro__">Otro…</option>
      </select>
      {otro && (
        <input className={styles.input} placeholder="Especifica el método de pago" value={valor} onChange={(e) => onCambiar(e.target.value)} />
      )}
      {valor === 'Transferencia bancaria' && (
        <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--topo-claro)' }}>
          Se añadirá tu IBAN guardado en Ajustes de empresa, automáticamente.
        </p>
      )}
    </div>
  );
}

/** Fila de "Concepto / Cantidad / Precio" reutilizada en el formulario de borrador — mismo patrón en los dos sitios donde se edita una línea (crear y editar). */
function FilaLinea({ linea, quitable, onCambiar, onQuitar, onAnadir, esUltima }: {
  linea: LineaFacturaEmitida; quitable: boolean; esUltima: boolean;
  onCambiar: (cambios: Partial<LineaFacturaEmitida>) => void; onQuitar: () => void; onAnadir: () => void;
}) {
  return (
    <div style={{ display: 'flex', gap: '0.4rem' }}>
      <input
        className={styles.input} placeholder="Concepto" value={linea.concepto} style={{ flex: '1 1 auto' }}
        onChange={(e) => onCambiar({ concepto: e.target.value })}
      />
      <input
        className={styles.input} type="number" placeholder="Cantidad" value={linea.cantidad ?? 1} min={1} style={{ width: 80, flexShrink: 0 }}
        onChange={(e) => onCambiar({ cantidad: Number(e.target.value) || 1 })}
      />
      <input
        className={styles.input} type="number" placeholder="€/ud." value={linea.precio || ''} style={{ width: 110, flexShrink: 0 }}
        onChange={(e) => onCambiar({ precio: Number(e.target.value) })}
      />
      {quitable && <button className={styles.btnIcono} onClick={onQuitar} title="Quitar línea">✕</button>}
      {esUltima && <button className={styles.btnIcono} onClick={onAnadir} title="Añadir línea">+</button>}
    </div>
  );
}

/**
 * Facturación propia con SIF (Fase 1-5, 26/10/2026) — lista + editor simple
 * de facturas EMITIDAS, sección nueva y separada de "Facturas" (que sigue
 * siendo solo gastos/ingresos ya facturados por otro medio). Solo SIF, sin
 * VERI*FACTU: nada de lo que hay aquí envía nada a Hacienda — las facturas
 * quedan numeradas, selladas e íntegras, listas para enseñarse si las
 * piden. Función comercial de la app — deliberadamente SIN gate de plan
 * (decisión explícita del usuario, 26/10/2026): disponible en cualquier
 * plan, incluido el más básico, para quien solo quiera contratarlo por
 * esto.
 */
export function FacturasEmitidasLista({ clientes }: FacturasEmitidasListaProps) {
  const [facturas, setFacturas] = useState<FacturaEmitida[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<FacturaEmitida | null>(null);
  const [formAbierto, setFormAbierto] = useState(false);

  const nombreDe = useCallback((clienteId: string) => clientes.find((c) => c.id === clienteId)?.nombre ?? 'Cliente', [clientes]);

  const cargar = useCallback(() => {
    setCargando(true);
    api.obtenerFacturasEmitidas()
      .then(setFacturas)
      .catch((e) => setError(String(e).replace(/^Error:\s*/, '')))
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  if (cargando) return <p style={{ color: 'var(--topo-claro)', fontSize: '0.85rem' }}>Cargando facturas emitidas…</p>;

  if (abierta) {
    return (
      <DetalleFacturaEmitida
        factura={abierta}
        clienteNombre={nombreDe(abierta.clienteId)}
        onVolver={(recargar) => { setAbierta(null); if (recargar) cargar(); }}
        onActualizar={(f) => setAbierta(f)}
      />
    );
  }

  return (
    <div>
      {error && <p style={{ color: 'var(--rojo)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{error}</p>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '0.5rem', flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--topo-claro)' }}>
          {facturas.length} factura{facturas.length !== 1 ? 's' : ''} emitida{facturas.length !== 1 ? 's' : ''} — registro local, sin conexión con Hacienda (SIF sin VERI*FACTU).
        </p>
        <button className={styles.btnCirculoOscuro} onClick={() => setFormAbierto((v) => !v)} title={formAbierto ? 'Cancelar' : 'Nueva factura'}>
          {formAbierto
            ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>}
        </button>
      </div>

      {formAbierto && (
        <FormularioNuevaFactura
          clientes={clientes}
          onCreada={(f) => { setFormAbierto(false); setFacturas((prev) => [f, ...prev]); setAbierta(f); }}
        />
      )}

      {facturas.length === 0 && !formAbierto ? (
        <div className={styles.tabVacio}>
          <p>Todavía no hay ninguna factura emitida. Créala con «+».</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {facturas.map((f) => (
            <button
              key={f.id}
              className={styles.filaLista}
              onClick={() => setAbierta(f)}
              style={{ padding: '1rem', textAlign: 'left', width: '100%', border: 'none', font: 'inherit', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}
            >
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {f.numeroFormateado || 'Sin emitir'}
                  {f.naturaleza === 'rectificativa' && <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--ocre)' }}>RECTIFICATIVA</span>}
                </p>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'var(--topo-claro)' }}>
                  {nombreDe(f.clienteId)} · {f.titulo || 'Sin título'}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: COLOR_ESTADO[f.estado] }}>{ETIQUETA_ESTADO[f.estado]}</span>
                <span style={{ fontWeight: 800, fontSize: '1rem', whiteSpace: 'nowrap' }}>{formatoEuro(f.importeTotal)}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FormularioNuevaFactura({ clientes, onCreada }: { clientes: { id: string; nombre: string }[]; onCreada: (f: FacturaEmitida) => void }) {
  const [clienteId, setClienteId] = useState('');
  const [titulo, setTitulo] = useState('');
  const [lineas, setLineas] = useState<LineaFacturaEmitida[]>([nuevaLinea()]);
  const [vencimiento, setVencimiento] = useState('');
  const [metodoPago, setMetodoPago] = useState('');
  const [leyendaFiscal, setLeyendaFiscal] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Solo para mostrar en pantalla — el total "de verdad" lo calcula y guarda el servidor a partir de las líneas.
  const importeTotal = lineas.reduce((s, l) => s + (Number(l.precio) || 0) * (l.cantidad ?? 1), 0);

  /**
   * "Vista previa" es el paso siguiente real tras rellenar el formulario
   * (petición explícita del usuario, 27/10/2026: "cuando relleno los datos
   * y voy al siguiente paso, tienes que mostrarme una vista previa...
   * después decir guardar como borrador o emitir") — nunca se emite nada
   * aquí, solo se guarda como borrador (editable, borrable) y se abre el
   * PDF marcado como vista previa en una pestaña nueva. Desde la ficha del
   * borrador que se abre después (`onCreada`) ya están "Guardar",
   * "Vista previa" (para repetirla tras editar) y "Emitir" — ese último
   * paso, el irreversible, es una decisión aparte del usuario.
   */
  const crearYPrevisualizar = async () => {
    if (!clienteId) { setError('Elige un cliente.'); return; }
    setGuardando(true);
    setError(null);
    try {
      const creada = await api.crearFacturaEmitida({
        clienteId, titulo, lineas: lineas.filter((l) => l.concepto.trim()),
        vencimiento, metodoPago, leyendaFiscal,
      });
      await api.previsualizarPdfFacturaEmitida(creada.id);
      onCreada(creada);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar la vista previa.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div style={{ border: '1px solid var(--borde)', borderRadius: 8, padding: '1rem', marginBottom: '1.25rem', background: 'var(--fondo-panel)', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      <select className={styles.select} value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
        <option value="">Selecciona un cliente…</option>
        {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
      </select>
      <input className={styles.input} placeholder="Título (p. ej. Reforma cocina)" value={titulo} onChange={(e) => setTitulo(e.target.value)} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {lineas.map((l, i) => (
          <FilaLinea
            key={l.id} linea={l} quitable={lineas.length > 1} esUltima={i === lineas.length - 1}
            onCambiar={(cambios) => setLineas((prev) => prev.map((x) => (x.id === l.id ? { ...x, ...cambios } : x)))}
            onQuitar={() => setLineas((prev) => prev.filter((x) => x.id !== l.id))}
            onAnadir={() => setLineas((prev) => [...prev, nuevaLinea()])}
          />
        ))}
      </div>

      <p style={{ margin: 0, textAlign: 'right', fontWeight: 800 }}>Total: {formatoEuro(importeTotal)}</p>

      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        <label style={{ fontSize: '0.78rem', fontWeight: 700, flex: '1 1 160px' }}>
          Vencimiento <span style={{ fontWeight: 400, color: 'var(--topo-claro)' }}>(opcional)</span>
          <input className={styles.input} type="date" value={vencimiento} onChange={(e) => setVencimiento(e.target.value)} style={{ display: 'block', width: '100%', marginTop: '0.25rem' }} />
        </label>
        <label style={{ fontSize: '0.78rem', fontWeight: 700, flex: '1 1 160px' }}>
          Método de pago <span style={{ fontWeight: 400, color: 'var(--topo-claro)' }}>(opcional)</span>
          <div style={{ marginTop: '0.25rem' }}><SelectorMetodoPago valor={metodoPago} onCambiar={setMetodoPago} /></div>
        </label>
      </div>
      <label style={{ fontSize: '0.78rem', fontWeight: 700 }}>
        Nota legal / leyenda fiscal <span style={{ fontWeight: 400, color: 'var(--topo-claro)' }}>(opcional — ej. exención, inversión del sujeto pasivo…)</span>
        <textarea
          className={styles.input} rows={2} value={leyendaFiscal} onChange={(e) => setLeyendaFiscal(e.target.value)}
          placeholder="Escribe aquí el texto legal exacto si aplica a este caso — tú eres responsable de que sea correcto, no se genera solo."
          style={{ display: 'block', width: '100%', marginTop: '0.25rem', resize: 'vertical', fontFamily: 'inherit' }}
        />
      </label>

      {error && <p style={{ color: 'var(--rojo)', fontSize: '0.82rem', margin: 0 }}>{error}</p>}

      <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={crearYPrevisualizar} disabled={guardando}>
        {guardando ? 'Generando vista previa…' : 'Vista previa →'}
      </button>
      <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--topo-claro)' }}>
        Se guarda como borrador (editable, se puede borrar) y se abre el PDF en una pestaña nueva — nada se emite todavía.
      </p>
    </div>
  );
}

function DetalleFacturaEmitida({ factura, clienteNombre, onVolver, onActualizar }: {
  factura: FacturaEmitida; clienteNombre: string; onVolver: (recargar: boolean) => void; onActualizar: (f: FacturaEmitida) => void;
}) {
  const [titulo, setTitulo] = useState(factura.titulo);
  const [lineas, setLineas] = useState<LineaFacturaEmitida[]>(factura.lineas.length ? factura.lineas : [nuevaLinea()]);
  const [vencimiento, setVencimiento] = useState(factura.vencimiento || '');
  const [metodoPago, setMetodoPago] = useState(factura.metodoPago || '');
  const [leyendaFiscal, setLeyendaFiscal] = useState(factura.leyendaFiscal || '');
  const [guardando, setGuardando] = useState(false);
  const [previsualizando, setPrevisualizando] = useState(false);
  const [emitiendo, setEmitiendo] = useState(false);
  const [confirmandoEmitir, setConfirmandoEmitir] = useState(false);
  const [confirmandoAnular, setConfirmandoAnular] = useState(false);
  const [motivoAnular, setMotivoAnular] = useState('');
  const [rectificando, setRectificando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const esBorrador = factura.estado === 'borrador';
  // Solo para mostrar en pantalla — el total "de verdad" lo calcula y guarda el servidor a partir de las líneas.
  const importeTotal = lineas.reduce((s, l) => s + (Number(l.precio) || 0) * (l.cantidad ?? 1), 0);
  const cambiosBorrador = { titulo, lineas, vencimiento, metodoPago, leyendaFiscal };

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      const actualizada = await api.actualizarFacturaEmitidaBorrador(factura.id, cambiosBorrador);
      onActualizar(actualizada);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  };

  const emitir = async () => {
    setEmitiendo(true);
    setError(null);
    try {
      await api.actualizarFacturaEmitidaBorrador(factura.id, cambiosBorrador); // guarda los últimos cambios antes de sellar
      const emitida = await api.emitirFacturaEmitida(factura.id);
      setConfirmandoEmitir(false);
      onActualizar(emitida);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo emitir la factura.');
    } finally {
      setEmitiendo(false);
    }
  };

  const anular = async () => {
    setError(null);
    try {
      const anulada = await api.anularFacturaEmitida(factura.id, motivoAnular);
      setConfirmandoAnular(false);
      onActualizar(anulada);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo anular la factura.');
    }
  };

  const descargarPdf = () => {
    api.descargarPdfFacturaEmitida(factura.id, factura.numeroFormateado).catch((e) => setError(e instanceof Error ? e.message : 'No se pudo descargar el PDF.'));
  };

  /** Guarda lo que haya cambiado en el borrador y abre la vista previa actualizada — mismo paso que al crearlo, para poder repetirlo después de editar. */
  const previsualizar = async () => {
    setPrevisualizando(true);
    setError(null);
    try {
      const actualizada = await api.actualizarFacturaEmitidaBorrador(factura.id, cambiosBorrador);
      await api.previsualizarPdfFacturaEmitida(factura.id);
      onActualizar(actualizada);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar la vista previa.');
    } finally {
      setPrevisualizando(false);
    }
  };

  return (
    <div>
      <button className={styles.volver} onClick={() => onVolver(false)} style={{ marginBottom: '1rem' }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: -2, marginRight: 4 }}><polyline points="15 18 9 12 15 6" /></svg>
        Volver a facturas emitidas
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div>
          <p style={{ margin: 0, fontWeight: 800, fontSize: '1.15rem' }}>{factura.numeroFormateado || 'Borrador sin emitir'}</p>
          <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: 'var(--topo-claro)' }}>{clienteNombre}</p>
        </div>
        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: COLOR_ESTADO[factura.estado] }}>{ETIQUETA_ESTADO[factura.estado]}</span>
      </div>

      {factura.naturaleza === 'rectificativa' && (
        <p style={{ fontSize: '0.82rem', color: 'var(--ocre)', marginBottom: '1rem' }}>
          Rectifica a la factura {factura.numeroFacturaOriginal}{factura.motivoRectificacion ? ` — ${factura.motivoRectificacion}` : ''}
        </p>
      )}
      {factura.estado === 'anulada' && (
        <p style={{ fontSize: '0.82rem', color: 'var(--rojo)', marginBottom: '1rem' }}>Anulada{factura.motivoAnulacion ? ` — ${factura.motivoAnulacion}` : ''}</p>
      )}

      {esBorrador ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.25rem' }}>
          <input className={styles.input} placeholder="Título" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          {lineas.map((l, i) => (
            <FilaLinea
              key={l.id} linea={l} quitable={lineas.length > 1} esUltima={i === lineas.length - 1}
              onCambiar={(cambios) => setLineas((prev) => prev.map((x) => (x.id === l.id ? { ...x, ...cambios } : x)))}
              onQuitar={() => setLineas((prev) => prev.filter((x) => x.id !== l.id))}
              onAnadir={() => setLineas((prev) => [...prev, nuevaLinea()])}
            />
          ))}
          <p style={{ margin: 0, textAlign: 'right', fontWeight: 800 }}>Total: {formatoEuro(importeTotal)}</p>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            <label style={{ fontSize: '0.78rem', fontWeight: 700, flex: '1 1 160px' }}>
              Vencimiento <span style={{ fontWeight: 400, color: 'var(--topo-claro)' }}>(opcional)</span>
              <input className={styles.input} type="date" value={vencimiento} onChange={(e) => setVencimiento(e.target.value)} style={{ display: 'block', width: '100%', marginTop: '0.25rem' }} />
            </label>
            <label style={{ fontSize: '0.78rem', fontWeight: 700, flex: '1 1 160px' }}>
              Método de pago <span style={{ fontWeight: 400, color: 'var(--topo-claro)' }}>(opcional)</span>
              <div style={{ marginTop: '0.25rem' }}><SelectorMetodoPago valor={metodoPago} onCambiar={setMetodoPago} /></div>
            </label>
          </div>
          <label style={{ fontSize: '0.78rem', fontWeight: 700 }}>
            Nota legal / leyenda fiscal <span style={{ fontWeight: 400, color: 'var(--topo-claro)' }}>(opcional — tú eres responsable de que sea correcta)</span>
            <textarea
              className={styles.input} rows={2} value={leyendaFiscal} onChange={(e) => setLeyendaFiscal(e.target.value)}
              style={{ display: 'block', width: '100%', marginTop: '0.25rem', resize: 'vertical', fontFamily: 'inherit' }}
            />
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button className={styles.btn} onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
            <button className={styles.btn} onClick={previsualizar} disabled={previsualizando}>{previsualizando ? 'Generando…' : 'Vista previa'}</button>
            <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={() => setConfirmandoEmitir(true)}>Emitir</button>
            <ConfirmarBorrado onConfirmar={async () => { await api.borrarFacturaEmitidaBorrador(factura.id); onVolver(true); }} titulo="Borrar este borrador" label="Borrar" />
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
          {factura.lineas.map((l) => (
            <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
              <span>{l.concepto}{(l.cantidad ?? 1) !== 1 ? ` (${l.cantidad} ud. × ${formatoEuro(l.precio)})` : ''}</span>
              <span style={{ fontWeight: 700 }}>{formatoEuro(l.precio * (l.cantidad ?? 1))}</span>
            </div>
          ))}
          {(factura.vencimiento || factura.metodoPago) && (
            <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.8rem', color: 'var(--topo-claro)', marginTop: '0.3rem' }}>
              {factura.vencimiento && <span>Vencimiento: {formatoFecha(factura.vencimiento)}</span>}
              {factura.metodoPago && <span>Pago: {factura.metodoPago}</span>}
            </div>
          )}
          <p style={{ margin: '0.4rem 0 0', textAlign: 'right', fontWeight: 800, fontSize: '1.05rem' }}>Total: {formatoEuro(factura.importeTotal)}</p>
          <p style={{ margin: '0.6rem 0 0', fontSize: '0.72rem', color: 'var(--topo-claro)' }}>
            Emitida {formatoFecha(factura.fechaEmision)} · Huella: <span style={{ fontFamily: 'monospace' }}>{factura.hash.slice(0, 16)}…</span>
          </p>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
            <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={descargarPdf}>Descargar PDF</button>
            {factura.estado === 'emitida' && (
              <>
                <button className={styles.btn} onClick={() => setConfirmandoAnular(true)}>Anular</button>
                <button className={styles.btn} onClick={() => setRectificando(true)}>Rectificar</button>
              </>
            )}
          </div>
        </div>
      )}

      {error && <p style={{ color: 'var(--rojo)', fontSize: '0.82rem' }}>{error}</p>}

      {confirmandoEmitir && (
        <div className={styles.overlay} onClick={() => setConfirmandoEmitir(false)}>
          <div className={styles.modal} style={{ maxWidth: 420, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }} onClick={(e) => e.stopPropagation()}>
            <p style={{ margin: 0, fontWeight: 700 }}>¿Emitir esta factura?</p>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--topo-claro)' }}>Esto numera y sella la factura — ya no se podrá editar, solo rectificar. Si no la has revisado todavía, cierra esto y pulsa "Vista previa" primero.</p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={emitir} disabled={emitiendo}>{emitiendo ? 'Emitiendo…' : 'Sí, emitir'}</button>
              <button className={styles.btn} onClick={() => setConfirmandoEmitir(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {confirmandoAnular && (
        <div className={styles.overlay} onClick={() => setConfirmandoAnular(false)}>
          <div className={styles.modal} style={{ maxWidth: 420, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }} onClick={(e) => e.stopPropagation()}>
            <p style={{ margin: 0, fontWeight: 700 }}>Anular esta factura</p>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--topo-claro)' }}>No se borra — queda marcada como anulada, con el motivo, para siempre.</p>
            <input className={styles.input} placeholder="Motivo de la anulación" value={motivoAnular} onChange={(e) => setMotivoAnular(e.target.value)} />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className={`${styles.btn} ${styles.btnPeligro}`} onClick={anular}>Anular</button>
              <button className={styles.btn} onClick={() => setConfirmandoAnular(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {rectificando && (
        <RectificarFacturaEmitida
          factura={factura}
          onCerrar={() => setRectificando(false)}
          onCreada={() => onVolver(true)}
        />
      )}
    </div>
  );
}

function RectificarFacturaEmitida({ factura, onCerrar, onCreada }: { factura: FacturaEmitida; onCerrar: () => void; onCreada: () => void }) {
  const [motivo, setMotivo] = useState<'devolucion_mercancia' | 'error_facturacion' | 'descuento_posterior' | 'otro'>('error_facturacion');
  const [importe, setImporte] = useState<number>(-factura.importeTotal);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const crear = async () => {
    setGuardando(true);
    setError(null);
    try {
      const rectificativa = await api.rectificarFacturaEmitida(factura.id, {
        motivoRectificacion: motivo, importeTotal: importe,
        lineas: [{ id: Math.random().toString(36).slice(2), concepto: `Rectificación de ${factura.numeroFormateado}`, precio: importe, cantidad: 1 }],
      });
      await api.emitirFacturaEmitida(rectificativa.id);
      onCreada();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear la rectificativa.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onCerrar}>
      <div className={styles.modal} style={{ maxWidth: 420, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }} onClick={(e) => e.stopPropagation()}>
        <p style={{ margin: 0, fontWeight: 700 }}>Rectificar {factura.numeroFormateado}</p>
        <label style={{ fontSize: '0.78rem', fontWeight: 700 }}>
          Motivo
          <select className={styles.select} value={motivo} onChange={(e) => setMotivo(e.target.value as any)} style={{ display: 'block', width: '100%', marginTop: '0.3rem' }}>
            <option value="error_facturacion">Error de facturación</option>
            <option value="devolucion_mercancia">Devolución de mercancía</option>
            <option value="descuento_posterior">Descuento posterior</option>
            <option value="otro">Otro</option>
          </select>
        </label>
        <label style={{ fontSize: '0.78rem', fontWeight: 700 }}>
          Importe de la rectificación (negativo si es una devolución)
          <input className={styles.input} type="number" value={importe} onChange={(e) => setImporte(Number(e.target.value))} style={{ display: 'block', width: '100%', marginTop: '0.3rem' }} />
        </label>
        {error && <p style={{ color: 'var(--rojo)', fontSize: '0.82rem', margin: 0 }}>{error}</p>}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={crear} disabled={guardando}>{guardando ? 'Creando…' : 'Crear y emitir rectificativa'}</button>
          <button className={styles.btn} onClick={onCerrar}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
