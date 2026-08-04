import { useState } from 'react';
import type { Cliente } from './types.js';
import { generarId } from './mock.js';
import { ImporteInput } from './importe-input.js';
import styles from './styles.module.css';

/** Props del formulario de creación de cliente. */
export type FormularioClienteProps = {
  /** Se llama al guardar con el nuevo cliente creado. */
  onGuardar: (cliente: Cliente) => void;
  /** Se llama al cancelar / cerrar el modal. */
  onCerrar: () => void;
};

/**
 * Modal con el formulario para crear una nueva ficha de cliente / proyecto.
 */
export function FormularioCliente({ onGuardar, onCerrar }: FormularioClienteProps) {
  const [nombre, setNombre] = useState('');
  const [proyecto, setProyecto] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [direccion, setDireccion] = useState('');
  const [presupuesto, setPresupuesto] = useState('');
  const [tarifaHora, setTarifaHora] = useState('30');

  const guardar = () => {
    if (!nombre.trim()) return;
    const cliente: Cliente = {
      id: generarId(),
      nombre: nombre.trim(),
      proyecto: proyecto.trim(),
      telefono: telefono.trim(),
      email: email.trim(),
      direccion: direccion.trim(),
      presupuesto: Number(presupuesto) || 0,
      tarifaHora: Number(tarifaHora) || 0,
      creado: new Date().toISOString().slice(0, 10),
      estado: 'presupuestado',
      movimientos: [],
      horas: [],
      adjuntos: [],
      fotos: [],
    };
    onGuardar(cliente);
  };

  return (
    <div className={styles.overlay} onClick={onCerrar}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.modalTitulo}>🪵 Nueva ficha de cliente</h2>
        <div className={styles.formGrid}>
          <div className={`${styles.campo} ${styles.full}`}>
            <label className={styles.campoLabel}>Nombre del cliente *</label>
            <input className={styles.input} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre y apellidos" />
          </div>
          <div className={`${styles.campo} ${styles.full}`}>
            <label className={styles.campoLabel}>Proyecto</label>
            <input className={styles.input} value={proyecto} onChange={(e) => setProyecto(e.target.value)} placeholder="Ej. Cocina a medida en roble" />
          </div>
          <div className={styles.campo}>
            <label className={styles.campoLabel}>Teléfono</label>
            <input className={styles.input} value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="600 000 000" />
          </div>
          <div className={styles.campo}>
            <label className={styles.campoLabel}>Email</label>
            <input className={styles.input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@email.com" />
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
        <div className={styles.modalAcciones}>
          <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={onCerrar}>Cancelar</button>
          <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={guardar}>Crear ficha</button>
        </div>
      </div>
    </div>
  );
}
