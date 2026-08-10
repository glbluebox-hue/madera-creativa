import { useState } from 'react';
import type { Cliente, Estancia } from './types.js';
import { generarId } from './mock.js';
import { generarDespiece } from './despiece.js';
import styles from './styles.module.css';
import { PizarraMedidas, type DibujoGuardado } from './pizarra-medidas.js';

/** Props del panel de mediciones. */
export type TabMedicionesProps = {
  /** Cliente con sus estancias. */
  cliente: Cliente;
  /** Guarda los cambios. */
  onActualizar: (cliente: Cliente) => void;
};

/**
 * Pestaña "Mediciones": gestiona las estancias del proyecto con sus medidas
 * (altura, anchura, profundidad, ángulos, desniveles, escuadra) y permite
 * generar un despiece automático por estancia.
 */
export function TabMediciones({ cliente, onActualizar }: TabMedicionesProps) {
  const estancias = cliente.estancias ?? [];
  const [despiecePara, setDespiecePara] = useState<string | null>(null);

  const guardarEstancias = (nuevas: Estancia[]) =>
    onActualizar({ ...cliente, estancias: nuevas });

  const anadir = () =>
    guardarEstancias([
      ...estancias,
      { id: generarId(), nombre: `Estancia ${estancias.length + 1}`, ancho: 0, alto: 0, fondo: 0 },
    ]);

  const actualizar = (id: string, campo: keyof Estancia, valor: unknown) =>
    guardarEstancias(estancias.map((e) => (e.id === id ? { ...e, [campo]: valor } : e)));

  const borrar = (id: string) => guardarEstancias(estancias.filter((e) => e.id !== id));

  const guardarDibujo = (dibujo: DibujoGuardado) => {
    const previos = cliente.dibujos ?? [];
    const idx = previos.findIndex(d => d.id === dibujo.id);
    const nuevos = idx >= 0 ? previos.map((d, i) => i === idx ? dibujo : d) : [...previos, dibujo];
    onActualizar({ ...cliente, dibujos: nuevos });
  };

  return (
    <div className={styles.tabPanel}>
      {/* Pizarra de medidas con pantalla completa, voz y dibujos guardados */}
      <PizarraMedidas dibujos={cliente.dibujos ?? []} onGuardar={guardarDibujo} />

      <div className={styles.barraSeccion} style={{ marginTop: '2rem' }}>
        <h3 style={{ margin: 0 }}>Mediciones por estancia</h3>
        <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={anadir}>+ Añadir estancia</button>
      </div>

      {estancias.length === 0 ? (
        <div className={styles.tabVacio}>
          <div className={styles.tabVacioIcono} style={{ display: 'flex', justifyContent: 'center' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 3v4M11 3v2M15 3v4M3 7h4M3 11h2M3 15h4" /></svg>
          </div>
          <p>Aún no hay estancias medidas. Añade la primera.</p>
        </div>
      ) : (
        estancias.map((e) => {
          const piezas = generarDespiece(e);
          return (
            <div className={styles.estanciaCard} key={e.id}>
              <div className={styles.estanciaCabecera}>
                <input
                  className={styles.input}
                  style={{ maxWidth: 240, fontWeight: 700 }}
                  value={e.nombre}
                  onChange={(ev) => actualizar(e.id, 'nombre', ev.target.value)}
                />
                <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={() => borrar(e.id)}>Eliminar</button>
              </div>
              <div className={styles.medidasGrid}>
                <NumCampo label="Altura (cm)" valor={e.altura} onChange={(v) => actualizar(e.id, 'altura', v)} />
                <NumCampo label="Anchura (cm)" valor={e.anchura} onChange={(v) => actualizar(e.id, 'anchura', v)} />
                <NumCampo label="Profundidad (cm)" valor={e.profundidad} onChange={(v) => actualizar(e.id, 'profundidad', v)} />
                <TxtCampo label="Ángulos" valor={e.angulos} onChange={(v) => actualizar(e.id, 'angulos', v)} />
                <TxtCampo label="Desniveles" valor={e.desniveles} onChange={(v) => actualizar(e.id, 'desniveles', v)} />
                <TxtCampo label="Escuadra" valor={e.escuadra} onChange={(v) => actualizar(e.id, 'escuadra', v)} />
              </div>
              <div className={styles.campo} style={{ marginTop: '0.75rem' }}>
                <label className={styles.campoLabel}>Observaciones</label>
                <input className={styles.input} value={e.observaciones ?? ''} onChange={(ev) => actualizar(e.id, 'observaciones', ev.target.value)} />
              </div>

              <button
                className={`${styles.btn} ${styles.btnSecundario}`}
                style={{ marginTop: '0.75rem' }}
                onClick={() => setDespiecePara(despiecePara === e.id ? null : e.id)}
                disabled={piezas.length === 0}
              >
                {piezas.length === 0 ? 'Rellena las medidas para el despiece' : (despiecePara === e.id ? 'Ocultar despiece' : 'Generar despiece automático')}
              </button>

              {despiecePara === e.id && piezas.length > 0 && (
                <div style={{ overflowX: 'auto', marginTop: '0.75rem' }}>
                  <table className={styles.tablaDespiece}>
                    <thead>
                      <tr>
                        <th>Pieza</th><th>Cant.</th><th>Largo</th><th>Ancho</th><th>Grosor</th><th>Canteado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {piezas.map((p, i) => (
                        <tr key={i}>
                          <td>{p.nombre}</td>
                          <td>{p.cantidad}</td>
                          <td>{p.largo} mm</td>
                          <td>{p.ancho} mm</td>
                          <td>{p.grosor} mm</td>
                          <td>{p.canteado}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

function NumCampo({ label, valor, onChange }: { label: string; valor?: number; onChange: (v: number) => void }) {
  return (
    <div className={styles.campo}>
      <label className={styles.campoLabel}>{label}</label>
      <input className={styles.input} type="number" value={valor ?? ''} onChange={(e) => onChange(Number(e.target.value) || 0)} />
    </div>
  );
}

function TxtCampo({ label, valor, onChange }: { label: string; valor?: string; onChange: (v: string) => void }) {
  return (
    <div className={styles.campo}>
      <label className={styles.campoLabel}>{label}</label>
      <input className={styles.input} value={valor ?? ''} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
