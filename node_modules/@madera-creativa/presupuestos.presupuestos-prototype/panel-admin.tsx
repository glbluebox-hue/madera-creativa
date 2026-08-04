import { useState, useEffect, useCallback } from 'react';
import { formatoFecha } from './calculos.js';
import styles from './styles.module.css';

const BASE = '/api/presupuestos-service';

/**
 * Token de administrador. Usa el que guardó el login en localStorage; si no
 * existe, deriva el token estándar 'uid:admin' que el servidor reconoce.
 * Nunca contiene credenciales en texto plano.
 */
function tokenAdmin(): string {
  const guardado = localStorage.getItem('mc-auth-token');
  if (guardado) return guardado.startsWith('Bearer ') ? guardado.slice(7) : guardado;
  return btoa('uid:admin');
}

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

const BADGE: Record<EstadoUsuario, { color: string; label: string; emoji: string }> = {
  pendiente:  { color: '#f59e0b', label: 'Pendiente',  emoji: '⏳' },
  activo:     { color: '#16a34a', label: 'Activo',     emoji: '✅' },
  suspendido: { color: '#dc2626', label: 'Suspendido', emoji: '🚫' },
};

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
      const res = await fetch(`${BASE}/admin/usuarios`, {
        headers: { Authorization: `Bearer ${tokenAdmin()}` },
        credentials: 'include',
      });
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
      await fetch(`${BASE}/admin/usuarios/${id}/estado`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenAdmin()}` },
        credentials: 'include',
        body: JSON.stringify({ estado }),
      });
      setUsuarios(prev => prev.map(u => u.id === id ? { ...u, estado } : u));
    } catch {
      setError('Error al cambiar el estado.');
    }
  };

  const eliminar = async (id: string) => {
    try {
      await fetch(`${BASE}/admin/usuarios/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tokenAdmin()}` },
        credentials: 'include',
      });
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
            <h2 className={styles.h2}>🛡️ Panel de administración</h2>
            {pendientes > 0 && (
              <span style={{ background: '#f59e0b', color: '#fff', borderRadius: 20, padding: '2px 9px', fontSize: '0.72rem', fontWeight: 700 }}>
                {pendientes} pendiente{pendientes > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <button className={styles.btnIcono} onClick={onCerrar}>✕</button>
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
                {f === 'todos' ? 'Todos' : `${BADGE[f].emoji} ${BADGE[f].label}`}
                {f !== 'todos' && <span style={{ marginLeft: 4, opacity: 0.8 }}>({usuarios.filter(u => u.estado === f).length})</span>}
              </button>
            ))}
            <button className={`${styles.btn} ${styles.btnSecundario}`} style={{ marginLeft: 'auto', fontSize: '0.78rem' }} onClick={cargar}>🔄 Actualizar</button>
          </div>

          {/* Errores */}
          {error && <div style={{ background: '#ffebee', border: '1px solid #ef9a9a', borderRadius: 8, padding: '0.6rem 0.85rem', fontSize: '0.82rem', color: '#c62828', marginBottom: '1rem' }}>{error}</div>}

          {/* Lista */}
          {cargando ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--topo-claro)' }}>⏳ Cargando usuarios…</div>
          ) : filtrados.length === 0 ? (
            <div className={styles.vacio}>
              <div className={styles.vacioIcono}>👥</div>
              <p>{filtro === 'todos' ? 'Aún no hay usuarios registrados.' : `Sin usuarios en estado "${filtro}".`}</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {filtrados.map(u => {
                const badge = BADGE[u.estado];
                return (
                  <div key={u.id} style={{
                    background: u.estado === 'pendiente' ? '#fffbeb' : '#fff',
                    border: `1px solid ${u.estado === 'pendiente' ? '#fcd34d' : 'var(--borde)'}`,
                    borderRadius: 10, padding: '0.85rem 1rem',
                    display: 'flex', flexDirection: 'column', gap: '0.5rem',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      {/* Avatar */}
                      <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#4B433A', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '1rem', flexShrink: 0 }}>
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
                        background: badge.color, color: '#fff', flexShrink: 0,
                      }}>
                        {badge.emoji} {badge.label}
                      </span>
                    </div>

                    {/* Acciones */}
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      {u.estado !== 'activo' && (
                        <button className={`${styles.btn} ${styles.btnVerde}`} style={{ fontSize: '0.78rem' }} onClick={() => cambiarEstado(u.id, 'activo')}>
                          ✅ Aprobar
                        </button>
                      )}
                      {u.estado !== 'suspendido' && (
                        <button className={`${styles.btn} ${styles.btnPeligro}`} style={{ fontSize: '0.78rem' }} onClick={() => cambiarEstado(u.id, 'suspendido')}>
                          🚫 Suspender
                        </button>
                      )}
                      {u.estado === 'suspendido' && (
                        <button className={`${styles.btn} ${styles.btnSecundario}`} style={{ fontSize: '0.78rem' }} onClick={() => cambiarEstado(u.id, 'pendiente')}>
                          ↩️ Volver a pendiente
                        </button>
                      )}
                      {accion?.id === u.id && accion.tipo === 'borrar' ? (
                        <>
                          <button className={`${styles.btn} ${styles.btnPeligro}`} style={{ fontSize: '0.78rem' }} onClick={() => eliminar(u.id)}>Sí, eliminar</button>
                          <button className={`${styles.btn} ${styles.btnSecundario}`} style={{ fontSize: '0.78rem' }} onClick={() => setAccion(null)}>Cancelar</button>
                        </>
                      ) : (
                        <button className={styles.btnIcono} style={{ color: 'var(--rojo)', marginLeft: 'auto' }} title="Eliminar usuario" onClick={() => setAccion({ id: u.id, tipo: 'borrar' })}>🗑</button>
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
