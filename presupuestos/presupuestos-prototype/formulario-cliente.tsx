import { useState, useEffect } from 'react';
import type { Proyecto } from './types.js';
import * as api from './api.js';
import { ImporteInput } from './importe-input.js';
import styles from './styles.module.css';

/** Props del formulario de creación de proyecto. */
export type FormularioClienteProps = {
  /** Se llama con el proyecto ya creado en el servidor (cliente nuevo o existente, según lo elegido). */
  onGuardar: (proyecto: Proyecto) => void;
  /** Se llama al cancelar / cerrar el modal. */
  onCerrar: () => void;
};

/**
 * Modal "Nuevo proyecto" — incremento "Cliente ≠ Proyecto" (especificación
 * del usuario, 20/08/2026): antes creaba una ficha que mezclaba identidad
 * y trabajo en un mismo objeto local con id generado en el navegador;
 * ahora, para un cliente nuevo, crea primero la identidad en el servidor
 * (`POST /clientes`) y luego el proyecto (`POST /proyectos`) enlazado a
 * ella; para un cliente ya existente, salta directamente al proyecto —
 * nunca duplica al cliente, y el proyecto nuevo siempre empieza en cero
 * (nunca copia nada de otro proyecto del mismo cliente).
 */
export function FormularioCliente({ onGuardar, onCerrar }: FormularioClienteProps) {
  const [modo, setModo] = useState<'nuevo' | 'existente'>('nuevo');
  const [clientesExistentes, setClientesExistentes] = useState<{ id: string; nombre: string }[]>([]);
  useEffect(() => {
    api.obtenerNombresClientes().then(setClientesExistentes).catch(() => setClientesExistentes([]));
  }, []);
  const [clienteExistenteId, setClienteExistenteId] = useState('');

  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [proyecto, setProyecto] = useState('');
  const [direccion, setDireccion] = useState('');
  const [presupuesto, setPresupuesto] = useState('');
  const [tarifaHora, setTarifaHora] = useState('30');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const puedeGuardar = modo === 'nuevo' ? nombre.trim().length > 0 : clienteExistenteId.length > 0;

  const guardar = async () => {
    if (!puedeGuardar || guardando) return;
    setGuardando(true);
    setError(null);
    try {
      const clienteId = modo === 'existente'
        ? clienteExistenteId
        : (await api.crearCliente({ nombre: nombre.trim(), telefono: telefono.trim(), email: email.trim() })).id;
      const nuevoProyecto = await api.crearProyecto({
        clienteId,
        proyecto: proyecto.trim(),
        direccion: direccion.trim(),
        presupuesto: Number(presupuesto) || 0,
        tarifaHora: Number(tarifaHora) || 0,
      });
      onGuardar(nuevoProyecto);
    } catch (e) {
      setError(String(e).replace(/^Error:\s*/, ''));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onCerrar}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.modalTitulo} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
          Nuevo proyecto
        </h2>

        <div className={styles.filtrosPill} style={{ marginBottom: '0.75rem' }}>
          <button type="button" className={`${styles.filtroPill} ${modo === 'nuevo' ? styles.filtroPillActivo : ''}`} onClick={() => setModo('nuevo')}>Cliente nuevo</button>
          <button type="button" className={`${styles.filtroPill} ${modo === 'existente' ? styles.filtroPillActivo : ''}`} onClick={() => setModo('existente')}>Cliente existente</button>
        </div>

        <div className={styles.formGrid}>
          {modo === 'existente' ? (
            <div className={`${styles.campo} ${styles.full}`}>
              <label className={styles.campoLabel}>Cliente *</label>
              <select className={styles.select} value={clienteExistenteId} onChange={(e) => setClienteExistenteId(e.target.value)}>
                <option value="">Selecciona un cliente…</option>
                {clientesExistentes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
          ) : (
            <>
              <div className={`${styles.campo} ${styles.full}`}>
                <label className={styles.campoLabel}>Nombre del cliente *</label>
                <input className={styles.input} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre y apellidos" />
              </div>
              <div className={styles.campo}>
                <label className={styles.campoLabel}>Teléfono</label>
                <input className={styles.input} value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="600 000 000" />
              </div>
              <div className={styles.campo}>
                <label className={styles.campoLabel}>Email</label>
                <input className={styles.input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@email.com" />
              </div>
            </>
          )}
          <div className={`${styles.campo} ${styles.full}`}>
            <label className={styles.campoLabel}>Proyecto</label>
            <input className={styles.input} value={proyecto} onChange={(e) => setProyecto(e.target.value)} placeholder="Ej. Cocina a medida en roble" />
          </div>
          <div className={`${styles.campo} ${styles.full}`}>
            <label className={styles.campoLabel}>Dirección del trabajo</label>
            <input className={styles.input} value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Calle, número, ciudad" />
          </div>
          <div className={styles.campo}>
            <label className={styles.campoLabel}>Presupuesto (€)</label>
            <ImporteInput value={presupuesto} onChange={setPresupuesto} placeholder="0,00" />
          </div>
          <div className={styles.campo}>
            <label className={styles.campoLabel}>Tarifa por hora (€)</label>
            <ImporteInput value={tarifaHora} onChange={setTarifaHora} placeholder="30,00" />
          </div>
        </div>
        {error && <p style={{ color: 'var(--rojo, #c0392b)', fontSize: '0.82rem', margin: '0.5rem 0 0' }}>{error}</p>}
        <div className={styles.modalAcciones}>
          <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={onCerrar}>Cancelar</button>
          <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={guardar} disabled={!puedeGuardar || guardando}>
            {guardando ? 'Creando…' : 'Crear proyecto'}
          </button>
        </div>
      </div>
    </div>
  );
}
