import { useState, useEffect } from 'react';
import type { Cliente, Proyecto } from './types.js';
import { formatoEuro } from './calculos.js';
import { ImporteInput } from './importe-input.js';
import * as api from './api.js';
import styles from './styles.module.css';

/** Datos combinados de identidad (Cliente) + proyecto, tal como los edita este formulario en un único sitio. */
type FormDatos = Pick<Cliente, 'nombre' | 'telefono' | 'email'> &
  Pick<Proyecto, 'proyecto' | 'direccion' | 'presupuesto' | 'tarifaHora' | 'whatsapp' | 'ubicacion' | 'codigoPuerta' | 'planta' | 'ascensor' | 'zonaCarga' | 'observacionesAcceso' | 'fechaMedicion' | 'fechaMontaje'>;

/** Props del panel de datos del cliente/proyecto. */
export type TabDatosProps = {
  /** Cliente (identidad) al que pertenece el proyecto. */
  cliente: Cliente;
  /** Proyecto a mostrar/editar. */
  proyecto: Proyecto;
  /** Guarda los cambios de identidad (nombre/teléfono/email) — incremento "Cliente ≠ Proyecto", 20/08/2026. */
  onActualizarCliente: (cliente: Cliente) => void;
  /** Guarda los cambios propios del proyecto (dirección, datos de acceso, fechas...). */
  onActualizarProyecto: (proyecto: Proyecto) => void;
  /**
   * Cambia (cualquier valor distinto del anterior) para forzar la apertura
   * en modo edición desde fuera — usado por el botón "Editar" de la
   * cabecera de la ficha, para no obligar a venir primero a esta pestaña y
   * pulsar Editar otra vez.
   */
  abrirEdicion?: number;
};

function formDesde(cliente: Cliente, proyecto: Proyecto): FormDatos {
  return {
    nombre: cliente.nombre, telefono: cliente.telefono, email: cliente.email,
    proyecto: proyecto.proyecto, direccion: proyecto.direccion, presupuesto: proyecto.presupuesto, tarifaHora: proyecto.tarifaHora,
    whatsapp: proyecto.whatsapp, ubicacion: proyecto.ubicacion, codigoPuerta: proyecto.codigoPuerta, planta: proyecto.planta,
    ascensor: proyecto.ascensor, zonaCarga: proyecto.zonaCarga, observacionesAcceso: proyecto.observacionesAcceso,
    fechaMedicion: proyecto.fechaMedicion, fechaMontaje: proyecto.fechaMontaje,
  };
}

/**
 * Pestaña "Datos": muestra y permite editar los datos de contacto del
 * cliente y, en el mismo formulario, los datos propios del proyecto
 * (acceso a la obra, fechas clave, presupuesto estimado) — dos entidades
 * distintas desde el incremento "Cliente ≠ Proyecto" (20/08/2026), pero se
 * siguen editando juntas en una sola pantalla porque así es como el
 * carpintero las piensa. Al guardar, cada mitad viaja a su propio destino.
 */
export function TabDatos({ cliente, proyecto, onActualizarCliente, onActualizarProyecto, abrirEdicion }: TabDatosProps) {
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState<FormDatos>(() => formDesde(cliente, proyecto));

  useEffect(() => {
    if (abrirEdicion) { setForm(formDesde(cliente, proyecto)); setEdit(true); }
    // Solo debe reaccionar a que `abrirEdicion` cambie (un "disparador"),
    // nunca a que cambien `cliente`/`proyecto`/`abrirEdicion` fuente — si se
    // añadieran a las dependencias, cualquier guardado en segundo plano
    // reabriría el formulario solo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abrirEdicion]);

  const set = (campo: keyof FormDatos, valor: unknown) =>
    setForm((f) => ({ ...f, [campo]: valor }));

  const guardar = () => {
    // El presupuesto usa su propia ruta quirúrgica — `onActualizarProyecto`
    // (guardado genérico del proyecto) ya no persiste este campo tras la
    // creación, ver comentario en `ficha-cliente.tsx`.
    if (form.presupuesto !== proyecto.presupuesto) {
      api.cambiarPresupuestoProyecto(proyecto.id, form.presupuesto || 0);
    }
    if (form.nombre !== cliente.nombre || form.telefono !== cliente.telefono || form.email !== cliente.email) {
      onActualizarCliente({ ...cliente, nombre: form.nombre, telefono: form.telefono, email: form.email });
    }
    onActualizarProyecto({
      ...proyecto,
      proyecto: form.proyecto, direccion: form.direccion, presupuesto: form.presupuesto, tarifaHora: form.tarifaHora,
      whatsapp: form.whatsapp, ubicacion: form.ubicacion, codigoPuerta: form.codigoPuerta, planta: form.planta,
      ascensor: form.ascensor, zonaCarga: form.zonaCarga, observacionesAcceso: form.observacionesAcceso,
      fechaMedicion: form.fechaMedicion, fechaMontaje: form.fechaMontaje,
    });
    setEdit(false);
  };

  if (!edit) {
    const filas: { label: string; valor: string }[] = [
      { label: 'Teléfono', valor: cliente.telefono || '—' },
      { label: 'WhatsApp', valor: proyecto.whatsapp || '—' },
      { label: 'Email', valor: cliente.email || '—' },
      { label: 'Dirección', valor: proyecto.direccion || '—' },
      { label: 'Ubicación / Maps', valor: proyecto.ubicacion || '—' },
      { label: 'Código de puerta', valor: proyecto.codigoPuerta || '—' },
      { label: 'Planta', valor: proyecto.planta || '—' },
      { label: 'Ascensor', valor: proyecto.ascensor ? 'Sí' : 'No' },
      { label: 'Zona de carga', valor: proyecto.zonaCarga || '—' },
      { label: 'Observaciones de acceso', valor: proyecto.observacionesAcceso || '—' },
      { label: 'Fecha de medición', valor: proyecto.fechaMedicion || '—' },
      { label: 'Fecha de montaje', valor: proyecto.fechaMontaje || '—' },
      { label: 'Presupuesto acordado', valor: formatoEuro(proyecto.presupuesto) },
      { label: 'Tarifa por hora', valor: formatoEuro(proyecto.tarifaHora) },
    ];
    return (
      <div className={styles.tabPanel}>
        <div className={styles.barraSeccion}>
          <h3 className={styles.h3 ?? ''}>Datos del cliente</h3>
          <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={() => { setForm(formDesde(cliente, proyecto)); setEdit(true); }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4, verticalAlign: -2 }}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z" /></svg>
            Editar
          </button>
        </div>
        <div className={styles.fichaInfoGrid}>
          {filas.map((f) => (
            <div className={styles.infoItem} key={f.label}>
              <span className={styles.infoLabel}>{f.label}</span>
              <span className={styles.infoValor}>{f.valor}</span>
            </div>
          ))}
        </div>
        {proyecto.ubicacion && (
          <a
            className={`${styles.btn} ${styles.btnSecundario}`}
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(proyecto.ubicacion)}`}
            target="_blank"
            rel="noreferrer"
            style={{ alignSelf: 'flex-start' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4, verticalAlign: -2 }}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
            Abrir en Google Maps
          </a>
        )}
      </div>
    );
  }

  return (
    <div className={styles.tabPanel}>
      <div className={styles.formGrid}>
        <Campo label="Nombre" valor={form.nombre} onChange={(v) => set('nombre', v)} full />
        <Campo label="Proyecto" valor={form.proyecto} onChange={(v) => set('proyecto', v)} full />
        <Campo label="Teléfono" valor={form.telefono} onChange={(v) => set('telefono', v)} />
        <Campo label="WhatsApp" valor={form.whatsapp ?? ''} onChange={(v) => set('whatsapp', v)} />
        <Campo label="Email" valor={form.email} onChange={(v) => set('email', v)} />
        <Campo label="Dirección" valor={form.direccion} onChange={(v) => set('direccion', v)} full />
        <Campo label="Ubicación / enlace Maps" valor={form.ubicacion ?? ''} onChange={(v) => set('ubicacion', v)} full />
        <Campo label="Código de puerta" valor={form.codigoPuerta ?? ''} onChange={(v) => set('codigoPuerta', v)} />
        <Campo label="Planta" valor={form.planta ?? ''} onChange={(v) => set('planta', v)} />
        <div className={styles.campo}>
          <label className={styles.campoLabel}>Ascensor</label>
          <select className={styles.select} value={form.ascensor ? 'si' : 'no'} onChange={(e) => set('ascensor', e.target.value === 'si')}>
            <option value="no">No</option>
            <option value="si">Sí</option>
          </select>
        </div>
        <Campo label="Zona de carga" valor={form.zonaCarga ?? ''} onChange={(v) => set('zonaCarga', v)} />
        <Campo label="Observaciones de acceso" valor={form.observacionesAcceso ?? ''} onChange={(v) => set('observacionesAcceso', v)} full />
        <div className={styles.campo}>
          <label className={styles.campoLabel}>Fecha de medición</label>
          <input className={styles.input} type="date" value={form.fechaMedicion ?? ''} onChange={(e) => set('fechaMedicion', e.target.value)} />
        </div>
        <div className={styles.campo}>
          <label className={styles.campoLabel}>Fecha de montaje</label>
          <input className={styles.input} type="date" value={form.fechaMontaje ?? ''} onChange={(e) => set('fechaMontaje', e.target.value)} />
        </div>
        <div className={styles.campo}>
          <label className={styles.campoLabel}>Presupuesto (€)</label>
          <ImporteInput value={String(form.presupuesto || '')} onChange={v => set('presupuesto', parseFloat(v) || 0)} placeholder="0,00" />
        </div>
        <div className={styles.campo}>
          <label className={styles.campoLabel}>Tarifa por hora (€)</label>
          <ImporteInput value={String(form.tarifaHora || '')} onChange={v => set('tarifaHora', parseFloat(v) || 0)} placeholder="30,00" />
        </div>
      </div>
      <div className={styles.modalAcciones}>
        <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={() => setEdit(false)}>Cancelar</button>
        <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={guardar}>Guardar cambios</button>
      </div>
    </div>
  );
}

/** Campo de texto reutilizable. */
function Campo({
  label,
  valor,
  onChange,
  full,
}: {
  label: string;
  valor: string;
  onChange: (v: string) => void;
  full?: boolean;
}) {
  return (
    <div className={`${styles.campo} ${full ? styles.full : ''}`}>
      <label className={styles.campoLabel}>{label}</label>
      <input className={styles.input} value={valor} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
