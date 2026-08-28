import { useState } from 'react';
import { ImporteInput } from './importe-input.js';
import styles from './styles.module.css';

export type TrabajoExtraModalProps = {
  /** Se llama al confirmar, con la descripción y el precio ya validados (>0). */
  onConfirmar: (descripcion: string, precio: number) => void;
  onCerrar: () => void;
  enviando?: boolean;
};

/**
 * "+ Trabajo extra" (pedido real, 28/08/2026: "el cliente me pide otras
 * cosas durante la obra, ¿cómo sumo esto al presupuesto?") — dos campos,
 * nada más: qué se ha acordado y por cuánto. Al confirmar, el servidor
 * suma el precio al "Presupuesto acordado" del proyecto en la misma
 * operación que registra el trabajo (ver `svc.anadirTrabajoExtraProyecto`),
 * así que aquí no hace falta pedir nada más ni explicar cómo funciona.
 */
export function TrabajoExtraModal({ onConfirmar, onCerrar, enviando }: TrabajoExtraModalProps) {
  const [descripcion, setDescripcion] = useState('');
  const [precio, setPrecio] = useState('');

  const precioNumero = Number(precio.replace(',', '.'));
  const valido = descripcion.trim().length > 0 && Number.isFinite(precioNumero) && precioNumero > 0;

  const confirmar = () => {
    if (!valido) return;
    onConfirmar(descripcion.trim(), precioNumero);
  };

  return (
    <div className={styles.overlay} onClick={onCerrar}>
      <div className={styles.modal} style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.modalTitulo}>+ Trabajo extra</h2>
        <p style={{ margin: '0.3rem 0 1rem', fontSize: '0.82rem', color: 'var(--topo-claro)' }}>
          Algo que el cliente ha pedido durante la obra, aparte del presupuesto inicial. Se suma directamente al presupuesto acordado.
        </p>

        <label className={styles.campoLabel} style={{ display: 'block', marginBottom: '0.9rem' }}>
          Descripción
          <input
            className={styles.input}
            autoFocus
            placeholder="Ej. Balda extra en el armario del pasillo"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            style={{ width: '100%', marginTop: '0.3rem' }}
          />
        </label>

        <label className={styles.campoLabel} style={{ display: 'block', marginBottom: '1.1rem' }}>
          Precio (€)
          <ImporteInput value={precio} onChange={setPrecio} placeholder="0,00" style={{ width: '100%', marginTop: '0.3rem' }} />
        </label>

        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={onCerrar} disabled={enviando} style={{ flex: 1 }}>
            Cancelar
          </button>
          <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={confirmar} disabled={!valido || enviando} style={{ flex: 1 }}>
            {enviando ? 'Añadiendo…' : 'Añadir'}
          </button>
        </div>
      </div>
    </div>
  );
}
