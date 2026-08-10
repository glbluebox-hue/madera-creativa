import { useState, useMemo } from 'react';
import type { Cliente, Dibujo } from './types.js';
import { useDibujos } from './use-dibujos.js';
import { useCarpetas } from './use-carpetas.js';
import { EditorDibujo } from './editor-dibujo.js';
import { ConfirmarBorrado } from './confirmar-borrado.js';
import { formatoFecha } from './calculos.js';
import * as api from './api.js';
import styles from './styles.module.css';

/** Props del apartado "Dibujos" de la ficha de un cliente. */
export type TabDibujosProps = {
  cliente: Cliente;
};

const IconoDibujo = ({ s = 40 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" /></svg>
);
const IconoCarpeta = ({ s = 32 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
);
const IconoMas = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
);
const IconoBuscar = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
);
const IconoDuplicar = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
);
const IconoRenombrar = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" /></svg>
);
const IconoMover = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
);

const SIN_CARPETA = '';

/**
 * Apartado "Dibujos" de la ficha de un cliente (Fase 2.2) — repositorio
 * central de la documentación gráfica del cliente, organizada en carpetas
 * (igual que un carpintero organiza carpetas físicas de planos). Carga de
 * una vez todos los dibujos del cliente (volumen acotado, mismo criterio
 * que el resto de listas sin paginar de la app) y filtra en el cliente
 * entre vista de carpetas, contenido de una carpeta y resultados de
 * búsqueda — así cambiar de carpeta no dispara peticiones nuevas.
 */
export function TabDibujos({ cliente }: TabDibujosProps) {
  const { dibujos, cargando: cargandoDibujos, guardar, borrar, duplicar } = useDibujos(true, { clienteId: cliente.id });
  const { carpetas, cargando: cargandoCarpetas, crear, renombrar: renombrarCarpeta, borrar: borrarCarpetaApi } = useCarpetas(true, cliente.id);

  const [carpetaId, setCarpetaId] = useState<string | null>(null); // null = vista de carpetas
  const [busqueda, setBusqueda] = useState('');
  const [editando, setEditando] = useState<{ dibujo: Dibujo | null } | null>(null);
  const [cargandoCompleto, setCargandoCompleto] = useState(false);
  const [creandoCarpeta, setCreandoCarpeta] = useState(false);
  const [nombreNuevaCarpeta, setNombreNuevaCarpeta] = useState('');
  const [renombrandoCarpetaId, setRenombrandoCarpetaId] = useState<string | null>(null);
  const [nombreRenombrar, setNombreRenombrar] = useState('');
  const [moviendoDibujoId, setMoviendoDibujoId] = useState<string | null>(null);
  const [renombrandoDibujoId, setRenombrandoDibujoId] = useState<string | null>(null);
  const [nombreDibujoNuevo, setNombreDibujoNuevo] = useState('');
  const [errorCarpeta, setErrorCarpeta] = useState<string | null>(null);

  const carpetaActual = carpetaId !== null ? carpetas.find((c) => c.id === carpetaId) : undefined;
  const buscando = busqueda.trim().length > 0;

  const dibujosVisibles = useMemo(() => {
    if (buscando) {
      const q = busqueda.trim().toLowerCase();
      return dibujos.filter((d) => d.nombre.toLowerCase().includes(q));
    }
    if (carpetaId !== null) return dibujos.filter((d) => d.carpetaId === carpetaId);
    return [];
  }, [dibujos, buscando, busqueda, carpetaId]);

  const nombreCarpetaDe = (id: string) => (id === SIN_CARPETA ? 'Sin carpeta' : carpetas.find((c) => c.id === id)?.nombre ?? '—');

  const abrirNuevo = () => setEditando({ dibujo: null });

  const abrirExistente = async (d: Dibujo) => {
    setCargandoCompleto(true);
    try {
      const completo = await api.obtenerDibujo(d.id);
      setEditando({ dibujo: completo });
    } catch {
      setEditando({ dibujo: d });
    } finally {
      setCargandoCompleto(false);
    }
  };

  const confirmarNuevaCarpeta = async () => {
    const nombre = nombreNuevaCarpeta.trim();
    if (!nombre) { setCreandoCarpeta(false); return; }
    try {
      await crear(nombre);
      setCreandoCarpeta(false);
      setNombreNuevaCarpeta('');
      setErrorCarpeta(null);
    } catch (e) {
      setErrorCarpeta(String(e).replace(/^Error:\s*/, ''));
    }
  };

  const confirmarBorrarCarpeta = async (id: string) => {
    try {
      await borrarCarpetaApi(id);
      setErrorCarpeta(null);
    } catch (e) {
      setErrorCarpeta(String(e).replace(/^Error:\s*/, ''));
    }
  };

  const confirmarRenombrarCarpeta = async (id: string) => {
    const nombre = nombreRenombrar.trim();
    setRenombrandoCarpetaId(null);
    if (!nombre) return;
    try {
      await renombrarCarpeta(id, nombre);
      setErrorCarpeta(null);
    } catch (e) {
      setErrorCarpeta(String(e).replace(/^Error:\s*/, ''));
    }
  };

  const confirmarRenombrarDibujo = async (d: Dibujo) => {
    const nombre = nombreDibujoNuevo.trim();
    setRenombrandoDibujoId(null);
    if (!nombre || nombre === d.nombre) return;
    await guardar({ ...d, nombre });
  };

  const moverDibujo = async (d: Dibujo, nuevaCarpetaId: string) => {
    setMoviendoDibujoId(null);
    if (nuevaCarpetaId === d.carpetaId) return;
    await guardar({ ...d, carpetaId: nuevaCarpetaId });
  };

  if (editando) {
    return (
      <EditorDibujo
        dibujo={editando.dibujo}
        clienteId={cliente.id}
        carpetaId={carpetaId ?? SIN_CARPETA}
        onVolver={() => setEditando(null)}
        onGuardar={async (d) => { await guardar(d); setEditando(null); }}
      />
    );
  }

  return (
    <div className={styles.tabPanel}>
      <div className={styles.clientesCabecera}>
        <div className={styles.clientesBusqueda}>
          <IconoBuscar />
          <input
            type="text"
            placeholder="Buscar dibujo en todas las carpetas…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        {!buscando && carpetaId === null && (
          <button className={styles.btnCirculoOscuro} onClick={() => setCreandoCarpeta(true)} title="Nueva carpeta">
            <IconoMas />
          </button>
        )}
        {!buscando && carpetaId !== null && (
          <button className={styles.btnCirculoOscuro} onClick={abrirNuevo} title="Nuevo dibujo en esta carpeta">
            <IconoMas />
          </button>
        )}
      </div>

      {errorCarpeta && (
        <div className={styles.loginError} style={{ marginBottom: '0.75rem' }}>{errorCarpeta}</div>
      )}

      {/* ── Migas de pan ── */}
      {!buscando && carpetaId !== null && (
        <button className={styles.carpetaMigaVolver} onClick={() => setCarpetaId(null)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          Dibujos / {nombreCarpetaDe(carpetaId)}
        </button>
      )}

      {/* ── Vista de carpetas ── */}
      {!buscando && carpetaId === null && (
        <>
          {cargandoCarpetas || cargandoDibujos ? (
            <div className={styles.vacio}><p>Cargando carpetas…</p></div>
          ) : (
            <div className={styles.carpetasGrid}>
              {creandoCarpeta && (
                <div className={styles.carpetaCard} style={{ cursor: 'default' }}>
                  <IconoCarpeta />
                  <input
                    autoFocus
                    className={styles.input}
                    placeholder="Nombre de la carpeta"
                    value={nombreNuevaCarpeta}
                    onChange={(e) => setNombreNuevaCarpeta(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') confirmarNuevaCarpeta(); if (e.key === 'Escape') setCreandoCarpeta(false); }}
                    onBlur={confirmarNuevaCarpeta}
                  />
                </div>
              )}
              {carpetas.map((c) => (
                <div key={c.id} className={styles.carpetaCard} onClick={() => setCarpetaId(c.id)}>
                  {renombrandoCarpetaId === c.id ? (
                    <input
                      autoFocus
                      className={styles.input}
                      value={nombreRenombrar}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setNombreRenombrar(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') confirmarRenombrarCarpeta(c.id); if (e.key === 'Escape') setRenombrandoCarpetaId(null); }}
                      onBlur={() => confirmarRenombrarCarpeta(c.id)}
                    />
                  ) : (
                    <>
                      <IconoCarpeta />
                      <span className={styles.carpetaCardNombre}>{c.nombre}</span>
                      <span className={styles.carpetaCardCuenta}>{dibujos.filter((d) => d.carpetaId === c.id).length} dibujo(s)</span>
                      <div className={styles.carpetaCardAcciones} onClick={(e) => e.stopPropagation()}>
                        <button className={styles.btnIcono} title="Renombrar carpeta" onClick={() => { setRenombrandoCarpetaId(c.id); setNombreRenombrar(c.nombre); }}>
                          <IconoRenombrar />
                        </button>
                        <ConfirmarBorrado titulo="Borrar carpeta" onConfirmar={() => confirmarBorrarCarpeta(c.id)} />
                      </div>
                    </>
                  )}
                </div>
              ))}
              {dibujos.some((d) => d.carpetaId === SIN_CARPETA) && (
                <div className={styles.carpetaCard} onClick={() => setCarpetaId(SIN_CARPETA)}>
                  <IconoCarpeta />
                  <span className={styles.carpetaCardNombre}>Sin carpeta</span>
                  <span className={styles.carpetaCardCuenta}>{dibujos.filter((d) => d.carpetaId === SIN_CARPETA).length} dibujo(s)</span>
                </div>
              )}
              {!creandoCarpeta && carpetas.length === 0 && dibujos.length === 0 && (
                <div className={styles.vacio}>
                  <div className={styles.vacioIcono} style={{ display: 'flex', justifyContent: 'center' }}><IconoCarpeta s={40} /></div>
                  <p>Todavía no hay carpetas de dibujos para este cliente.</p>
                  <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={() => setCreandoCarpeta(true)}>
                    Crear la primera carpeta
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Contenido de una carpeta, o resultados de búsqueda ── */}
      {(buscando || carpetaId !== null) && (
        cargandoDibujos ? (
          <div className={styles.vacio}><p>Cargando dibujos…</p></div>
        ) : dibujosVisibles.length === 0 ? (
          <div className={styles.vacio}>
            <p>{buscando ? 'Ningún dibujo coincide con la búsqueda.' : 'Esta carpeta todavía no tiene dibujos.'}</p>
            {!buscando && (
              <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={abrirNuevo}>Crear un dibujo aquí</button>
            )}
          </div>
        ) : (
          <div className={styles.dibujosGrid}>
            {dibujosVisibles.map((d) => (
              <div key={d.id} className={styles.dibujoCard} onClick={() => abrirExistente(d)}>
                <div className={styles.dibujoCardMiniatura}>
                  {d.miniatura ? <img src={d.miniatura} alt={d.nombre} /> : <IconoDibujo s={28} />}
                </div>
                <div className={styles.dibujoCardCuerpo}>
                  {renombrandoDibujoId === d.id ? (
                    <input
                      autoFocus
                      className={styles.input}
                      value={nombreDibujoNuevo}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setNombreDibujoNuevo(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') confirmarRenombrarDibujo(d); if (e.key === 'Escape') setRenombrandoDibujoId(null); }}
                      onBlur={() => confirmarRenombrarDibujo(d)}
                    />
                  ) : (
                    <span className={styles.dibujoCardNombre}>{d.nombre}</span>
                  )}
                  <span className={styles.dibujoCardFecha}>
                    {formatoFecha(d.actualizadoEn)}{buscando && ` · ${nombreCarpetaDe(d.carpetaId)}`}
                  </span>
                </div>
                <div className={styles.dibujoCardAcciones} onClick={(e) => e.stopPropagation()}>
                  {moviendoDibujoId === d.id ? (
                    <select
                      autoFocus
                      className={styles.select}
                      defaultValue={d.carpetaId}
                      onChange={(e) => moverDibujo(d, e.target.value)}
                      onBlur={() => setMoviendoDibujoId(null)}
                    >
                      <option value={SIN_CARPETA}>Sin carpeta</option>
                      {carpetas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                  ) : (
                    <button className={styles.btnIcono} title="Mover a otra carpeta" onClick={() => setMoviendoDibujoId(d.id)}>
                      <IconoMover />
                    </button>
                  )}
                  <button className={styles.btnIcono} title="Renombrar" onClick={() => { setRenombrandoDibujoId(d.id); setNombreDibujoNuevo(d.nombre); }}>
                    <IconoRenombrar />
                  </button>
                  <button className={styles.btnIcono} title="Duplicar" onClick={() => duplicar(d.id)}>
                    <IconoDuplicar />
                  </button>
                  <ConfirmarBorrado titulo="Borrar dibujo" onConfirmar={() => borrar(d.id)} />
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {cargandoCompleto && (
        <div className={styles.overlay}>
          <p style={{ color: '#fff' }}>Abriendo dibujo…</p>
        </div>
      )}
    </div>
  );
}
