import { useState } from 'react';
import type { Cliente } from './types.js';
import { formatoEuro } from './calculos.js';
import { ImporteInput } from './importe-input.js';
import styles from './styles.module.css';

/** Props del panel de datos del cliente. */
export type TabDatosProps = {
  /** Cliente a mostrar/editar. */
  cliente: Cliente;
  /** Guarda los cambios del cliente. */
  onActualizar: (cliente: Cliente) => void;
};

/**
 * Pestaña "Datos": muestra y permite editar todos los datos de contacto,
 * acceso a la obra y fechas clave del proyecto.
 */
export function TabDatos({ cliente, onActualizar }: TabDatosProps) {
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState<Cliente>(cliente);

  const set = (campo: keyof Cliente, valor: unknown) =>
    setForm((f) => ({ ...f, [campo]: valor }));

  const guardar = () => {
    onActualizar(form);
    setEdit(false);
  };

  if (!edit) {
    const filas: { label: string; valor: string }[] = [
      { label: 'Teléfono', valor: cliente.telefono || '—' },
      { label: 'WhatsApp', valor: cliente.whatsapp || '—' },
      { label: 'Email', valor: cliente.email || '—' },
      { label: 'Dirección', valor: cliente.direccion || '—' },
      { label: 'Ubicación / Maps', valor: cliente.ubicacion || '—' },
      { label: 'Código de puerta', valor: cliente.codigoPuerta || '—' },
      { label: 'Planta', valor: cliente.planta || '—' },
      { label: 'Ascensor', valor: cliente.ascensor ? 'Sí' : 'No' },
      { label: 'Zona de carga', valor: cliente.zonaCarga || '—' },
      { label: 'Observaciones de acceso', valor: cliente.observacionesAcceso || '—' },
      { label: 'Fecha de medición', valor: cliente.fechaMedicion || '—' },
      { label: 'Fecha de montaje', valor: cliente.fechaMontaje || '—' },
      { label: 'Presupuesto acordado', valor: formatoEuro(cliente.presupuesto) },
      { label: 'Tarifa por hora', valor: formatoEuro(cliente.tarifaHora) },
    ];
    return (
      <div className={styles.tabPanel}>
        <div className={styles.barraSeccion}>
          <h3 className={styles.h3 ?? ''}>Datos del cliente</h3>
          <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={() => { setForm(cliente); setEdit(true); }}>
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
        {cliente.ubicacion && (
          <a
            className={`${styles.btn} ${styles.btnSecundario}`}
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cliente.ubicacion)}`}
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
