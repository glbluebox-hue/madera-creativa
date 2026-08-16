import { useState, useEffect, useCallback } from 'react';
import { formatoFecha } from './calculos.js';
import { fetchConAuth } from './api.js';
import styles from './styles.module.css';

type EstadoUsuario = 'pendiente' | 'activo' | 'suspendido';

type UsuarioAdmin = {
  id: string;
  nombre: string;
  email: string;
  estado: EstadoUsuario;
  esAdmin: boolean;
  creadoEn: string;
  ultimoAcceso?: string;
};

/** Props del panel de administración de usuarios. */
export type PanelAdminProps = {
  onCerrar: () => void;
};

const BADGE: Record<EstadoUsuario, { color: string; label: string }> = {
  pendiente:  { color: 'var(--ocre)', label: 'Pendiente' },
  activo:     { color: 'var(--verde)', label: 'Activo' },
  suspendido: { color: 'var(--rojo)', label: 'Suspendido' },
};

// Iconos de línea (Dirección Creativa) — sustituyen a los emoji anteriores.
const IconoReloj = ({ s = 12 }: { s?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>;
const IconoCheck = ({ s = 12 }: { s?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>;
const IconoBloqueado = ({ s = 12 }: { s?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>;
const IconoUsuarios = ({ s = 16 }: { s?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
function iconoBadge(estado: EstadoUsuario, s = 12) {
  if (estado === 'pendiente') return <IconoReloj s={s} />;
  if (estado === 'activo') return <IconoCheck s={s} />;
  return <IconoBloqueado s={s} />;
}

/**
 * Panel de administración de usuarios.
 * Solo visible para el administrador — permite aprobar, suspender y eliminar usuarios.
 */
export function PanelAdmin({ onCerrar }: PanelAdminProps) {
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [filtro, setFiltro] = useState<EstadoUsuario | 'todos'>('todos');
  const [accion, setAccion] = useState<{ id: string; tipo: 'borrar' } | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const res = await fetchConAuth('/admin/usuarios');
      if (!res.ok) throw new Error('Error al cargar usuarios');
      const data = await res.json() as UsuarioAdmin[];
      setUsuarios(data.filter(u => !u.esAdmin));
    } catch (e) {
      setError('No se pudieron cargar los usuarios.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const cambiarEstado = async (id: string, estado: EstadoUsuario) => {
    try {
      await fetchConAuth(`/admin/usuarios/${id}/estado`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado }),
      });
      setUsuarios(prev => prev.map(u => u.id === id ? { ...u, estado } : u));
    } catch {
      setError('Error al cambiar el estado.');
    }
  };

  const eliminar = async (id: string) => {
    try {
      await fetchConAuth(`/admin/usuarios/${id}`, { method: 'DELETE' });
      setUsuarios(prev => prev.filter(u => u.id !== id));
      setAccion(null);
    } catch {
      setError('Error al eliminar el usuario.');
    }
  };

  const pendientes = usuarios.filter(u => u.estado === 'pendiente').length;
  const filtrados = filtro === 'todos' ? usuarios : usuarios.filter(u => u.estado === filtro);

  return (
    <div className={styles.modalFondo} onClick={onCerrar}>
      <div className={styles.modalCaja} style={{ maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div className={styles.modalCabecera}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <h2 className={styles.h2} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
              Panel de administración
            </h2>
            {pendientes > 0 && (
              <span style={{ background: 'var(--ocre)', color: 'var(--blanco)', borderRadius: 'var(--radio-xl)', padding: '2px 9px', fontSize: '0.72rem', fontWeight: 700 }}>
                {pendientes} pendiente{pendientes > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <button className={styles.btnIcono} onClick={onCerrar} aria-label="Cerrar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div style={{ padding: '1.25rem' }}>

          {/* Filtros */}
          <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
            {(['todos', 'pendiente', 'activo', 'suspendido'] as const).map(f => (
              <button
                key={f}
                className={`${styles.btn} ${filtro === f ? styles.btnPrimario : styles.btnSecundario}`}
                style={{ fontSize: '0.78rem' }}
                onClick={() => setFiltro(f)}
              >
                {f === 'todos' ? 'Todos' : <>{iconoBadge(f)} {BADGE[f].label}</>}
                {f !== 'todos' && <span style={{ marginLeft: 4, opacity: 0.8 }}>({usuarios.filter(u => u.estado === f).length})</span>}
              </button>
            ))}
            <button className={`${styles.btn} ${styles.btnSecundario}`} style={{ marginLeft: 'auto', fontSize: '0.78rem' }} onClick={cargar}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4, verticalAlign: -2 }}><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
              Actualizar
            </button>
          </div>

          {/* Errores */}
          {error && <div style={{ background: 'var(--rojo-bg)', border: '1px solid var(--rojo)', borderRadius: 'var(--radio)', padding: '0.6rem 0.85rem', fontSize: '0.82rem', color: 'var(--rojo)', marginBottom: '1rem' }}>{error}</div>}

          {/* Lista */}
          {cargando ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--topo-claro)' }}>Cargando usuarios…</div>
          ) : filtrados.length === 0 ? (
            <div className={styles.vacio}>
              <div className={styles.vacioIcono} style={{ display: 'flex', justifyContent: 'center' }}><IconoUsuarios s={40} /></div>
              <p>{filtro === 'todos' ? 'Aún no hay usuarios registrados.' : `Sin usuarios en estado "${filtro}".`}</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {filtrados.map(u => {
                const badge = BADGE[u.estado];
                return (
                  <div key={u.id} style={{
                    background: u.estado === 'pendiente' ? 'var(--ocre-bg)' : 'var(--blanco)',
                    border: `1px solid ${u.estado === 'pendiente' ? 'var(--ocre)' : 'var(--borde)'}`,
                    borderRadius: 10, padding: '0.85rem 1rem',
                    display: 'flex', flexDirection: 'column', gap: '0.5rem',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      {/* Avatar */}
                      <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--topo)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--blanco)', fontWeight: 700, fontSize: '1rem', flexShrink: 0 }}>
                        {u.nombre.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: '0 0 0.1rem', fontWeight: 700, fontSize: '0.92rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email || u.nombre}</p>
                        <p style={{ margin: 0, fontSize: '0.68rem', color: 'var(--topo-claro)' }}>
                          Registro: {formatoFecha(u.creadoEn)}
                          {u.ultimoAcceso ? ` · Acceso: ${formatoFecha(u.ultimoAcceso)}` : ''}
                        </p>
                      </div>
                      <span style={{
                        fontSize: '0.7rem', fontWeight: 700, padding: '2px 9px', borderRadius: 20,
                        background: badge.color, color: 'var(--blanco)', flexShrink: 0,
                      }}>
                        {iconoBadge(u.estado)} {badge.label}
                      </span>
                    </div>

                    {/* Acciones */}
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      {u.estado !== 'activo' && (
                        <button className={`${styles.btn} ${styles.btnVerde}`} style={{ fontSize: '0.78rem' }} onClick={() => cambiarEstado(u.id, 'activo')}>
                          <IconoCheck /> Aprobar
                        </button>
                      )}
                      {u.estado !== 'suspendido' && (
                        <button className={`${styles.btn} ${styles.btnPeligro}`} style={{ fontSize: '0.78rem' }} onClick={() => cambiarEstado(u.id, 'suspendido')}>
                          <IconoBloqueado /> Suspender
                        </button>
                      )}
                      {u.estado === 'suspendido' && (
                        <button className={`${styles.btn} ${styles.btnSecundario}`} style={{ fontSize: '0.78rem' }} onClick={() => cambiarEstado(u.id, 'pendiente')}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: -2, marginRight: 2 }}><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
                          Volver a pendiente
                        </button>
                      )}
                      {accion?.id === u.id && accion.tipo === 'borrar' ? (
                        <>
                          <button className={`${styles.btn} ${styles.btnPeligro}`} style={{ fontSize: '0.78rem' }} onClick={() => eliminar(u.id)}>Sí, eliminar</button>
                          <button className={`${styles.btn} ${styles.btnSecundario}`} style={{ fontSize: '0.78rem' }} onClick={() => setAccion(null)}>Cancelar</button>
                        </>
                      ) : (
                        <button className={styles.btnIcono} style={{ color: 'var(--rojo)', marginLeft: 'auto' }} title="Eliminar usuario" aria-label="Eliminar usuario" onClick={() => setAccion({ id: u.id, tipo: 'borrar' })}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pie informativo */}
          <p style={{ marginTop: '1.25rem', fontSize: '0.72rem', color: 'var(--topo-claro)', textAlign: 'center' }}>
            Los usuarios suspendidos no pueden entrar. Al suspender, la sesión se cierra en 5 minutos.
          </p>
        </div>
      </div>
    </div>
  );
}
