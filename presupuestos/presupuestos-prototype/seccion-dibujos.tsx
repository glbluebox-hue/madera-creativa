import { useEffect, useState } from 'react';
import type { Dibujo } from './types.js';
import { useDibujos } from './use-dibujos.js';
import { EditorDibujo } from './editor-dibujo.js';
import { SelectorDestinoGuardado, type DestinoDibujo } from './selector-destino-guardado.js';
import { ConfirmarBorrado } from './confirmar-borrado.js';
import { formatoFecha } from './calculos.js';
import { urlImagenFiable } from './imagen-fallback.js';
import * as api from './api.js';
import styles from './styles.module.css';

/** Props de la bandeja de dibujos temporales. */
export type SeccionDibujosProps = {
  /** Lista ligera de clientes — para el selector de destino al guardar o asignar. */
  clientes?: { id: string; nombre: string }[];
  /**
   * Avisa al contenedor cuando el editor de un dibujo está abierto a
   * pantalla completa. Sin esto, la barra "← Inicio" móvil (fuera de este
   * componente, en `presupuestos-prototype.tsx`) sigue existiendo en el DOM
   * — solo tapada por z-index — mientras se dibuja, y un toque accidental
   * cerca del borde superior de la pantalla (muy fácil dibujando con el
   * dedo o con el canto de la mano) puede llegar a activarla y sacar al
   * usuario a Inicio sin querer. Quitarla del todo del DOM en vez de solo
   * ocultarla visualmente cierra esa vía por completo.
   */
  onEditorAbierto?: (abierto: boolean) => void;
};

const IconoDibujo = ({ s = 40 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" /></svg>
);
const IconoMas = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
);
const IconoBuscar = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
);
const IconoAsignar = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
);

/**
 * Bandeja de dibujos temporales (Fase 2.2 — antes galería global de todos
 * los dibujos, Fase 2.1). Desde que los dibujos de un cliente viven en su
 * ficha (`TabDibujos`), este apartado del menú lateral queda solo para los
 * dibujos sin cliente asignado: bocetos sueltos que se archivan más tarde
 * con "Asignar a cliente", sin haber tenido que decidir nada en el momento
 * de dibujar.
 */
export function SeccionDibujos({ clientes = [], onEditorAbierto }: SeccionDibujosProps) {
  const { dibujos, cargando, guardar, borrar } = useDibujos(true, { temporales: true });
  const [busqueda, setBusqueda] = useState('');
  const [editando, setEditando] = useState<{ dibujo: Dibujo | null } | null>(null);
  const [cargandoCompleto, setCargandoCompleto] = useState(false);
  const [asignando, setAsignando] = useState<Dibujo | null>(null);

  useEffect(() => {
    onEditorAbierto?.(editando !== null);
    return () => onEditorAbierto?.(false);
  }, [editando, onEditorAbierto]);

  const visibles = dibujos.filter((d) => d.nombre.toLowerCase().includes(busqueda.trim().toLowerCase()));

  const abrirNuevo = () => setEditando({ dibujo: null });

  const abrirExistente = async (d: Dibujo) => {
    setCargandoCompleto(true);
    try {
      const completo = await api.obtenerDibujo(d.id);
      setEditando({ dibujo: completo });
    } catch {
      setEditando({ dibujo: d }); // sin contenido — se abrirá en blanco antes que no abrir nada
    } finally {
      setCargandoCompleto(false);
    }
  };

  const confirmarAsignacion = async (destino: DestinoDibujo) => {
    if (!asignando) return;
    const d = asignando;
    setAsignando(null);
    await guardar({ ...d, clienteId: destino.proyectoId, carpetaId: destino.carpetaId });
  };

  if (editando) {
    return (
      <EditorDibujo
        dibujo={editando.dibujo}
        clientes={clientes}
        onVolver={() => setEditando(null)}
        onGuardar={async (d) => { await guardar(d); setEditando(null); }}
      />
    );
  }

  return (
    <div>
      <div className={styles.clientesCabecera}>
        <div className={styles.clientesBusqueda}>
          <IconoBuscar />
          <input
            type="text"
            placeholder="Buscar dibujo temporal…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        <button className={styles.btnCirculoOscuro} onClick={abrirNuevo} title="Nuevo dibujo" data-tutorial-id="dibujo-nuevo-btn">
          <IconoMas />
        </button>
      </div>
      <p className={styles.dashboardVacio} style={{ margin: '-0.5rem 0 1rem' }}>
        Dibujos sin cliente asignado todavía. Los dibujos de cada cliente viven en su ficha, pestaña "Dibujos".
      </p>

      {cargando ? (
        <div className={styles.vacio}><p>Cargando dibujos…</p></div>
      ) : dibujos.length === 0 ? (
        <div className={styles.vacio}>
          <div className={styles.vacioIcono} style={{ display: 'flex', justifyContent: 'center' }}>
            <IconoDibujo />
          </div>
          <p>No tienes dibujos temporales pendientes de archivar.</p>
          <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={abrirNuevo}>
            Crear un dibujo
          </button>
        </div>
      ) : visibles.length === 0 ? (
        <div className={styles.vacio}><p>Ningún dibujo coincide con la búsqueda.</p></div>
      ) : (
        <div className={styles.dibujosGrid}>
          {visibles.map((d) => (
            <div key={d.id} className={styles.dibujoCard} onClick={() => abrirExistente(d)}>
              <div className={styles.dibujoCardMiniatura}>
                {d.miniatura ? <img src={urlImagenFiable(d.miniatura)} alt={d.nombre} /> : <IconoDibujo s={28} />}
              </div>
              <div className={styles.dibujoCardCuerpo}>
                <span className={styles.dibujoCardNombre}>{d.nombre}</span>
                <span className={styles.dibujoCardFecha}>{formatoFecha(d.actualizadoEn)}</span>
              </div>
              <div className={styles.dibujoCardAcciones} onClick={(e) => e.stopPropagation()}>
                {clientes.length > 0 && (
                  <button className={styles.btnIcono} title="Asignar a un cliente" onClick={() => setAsignando(d)}>
                    <IconoAsignar />
                  </button>
                )}
                <ConfirmarBorrado titulo="Borrar dibujo" onConfirmar={() => borrar(d.id)} />
              </div>
            </div>
          ))}
        </div>
      )}

      {cargandoCompleto && (
        <div className={styles.overlay}>
          <p style={{ color: 'var(--blanco)' }}>Abriendo dibujo…</p>
        </div>
      )}

      {asignando && (
        <SelectorDestinoGuardado
          clientes={clientes}
          soloAsignarCliente
          onCancelar={() => setAsignando(null)}
          onConfirmar={confirmarAsignacion}
        />
      )}
    </div>
  );
}
