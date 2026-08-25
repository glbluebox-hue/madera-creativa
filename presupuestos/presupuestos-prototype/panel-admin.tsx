import { useState, useEffect, useCallback } from 'react';
import { formatoFecha } from './calculos.js';
import { fetchConAuth } from './api.js';
import styles from './styles.module.css';

type EstadoUsuario = 'pendiente' | 'activo' | 'suspendido';

type TipoAcceso = 'trial' | 'promotional' | 'free' | 'paid';
type PlanAcceso = 'NONE' | 'LIFETIME_FREE' | 'BASIC' | 'PRO' | 'PREMIUM';

type AccesoUsuario = {
  tipo: TipoAcceso;
  plan: PlanAcceso;
  activadoEn: string | null;
  expiraEn: string | null;
  origen: 'registro' | 'codigo' | 'admin' | 'pago';
  codigoUsado: string | null;
};

type UsuarioAdmin = {
  id: string;
  nombre: string;
  email: string;
  estado: EstadoUsuario;
  esAdmin: boolean;
  creadoEn: string;
  ultimoAcceso?: string;
  acceso: AccesoUsuario;
};

type CodigoPromocional = {
  id: string;
  codigo: string;
  activo: boolean;
  tipoAccesoConcedido: TipoAcceso;
  planConcedido: PlanAcceso;
  duracionDias: number | null;
  usosMaximos: number | null;
  usosActuales: number;
  fechaInicio: string | null;
  fechaExpiracion: string | null;
  creadoEn: string;
  notas: string;
};

type Periodicidad = 'mensual' | 'anual' | 'unico';

type CosteInfraestructura = {
  id: string;
  nombre: string;
  categoria: string;
  coste: number;
  moneda: string;
  periodicidad: Periodicidad;
  url: string;
  notas: string;
  activo: boolean;
  creadoEn: string;
  actualizadoEn: string;
};

const ETIQUETA_PERIODICIDAD: Record<Periodicidad, string> = { mensual: '/mes', anual: '/año', unico: 'pago único' };

const TIPOS_ACCESO: TipoAcceso[] = ['trial', 'promotional', 'free', 'paid'];
const PLANES_ACCESO: PlanAcceso[] = ['NONE', 'LIFETIME_FREE', 'BASIC', 'PRO', 'PREMIUM'];
const ETIQUETA_TIPO: Record<TipoAcceso, string> = { trial: 'Prueba', promotional: 'Promocional', free: 'Gratuito', paid: 'Pago' };
const ETIQUETA_PLAN: Record<PlanAcceso, string> = { NONE: 'Sin plan', LIFETIME_FREE: 'Gratis de por vida', BASIC: 'Basic', PRO: 'Pro', PREMIUM: 'Premium' };

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
  const [pestana, setPestana] = useState<'usuarios' | 'codigos' | 'costes'>('usuarios');

  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [filtro, setFiltro] = useState<EstadoUsuario | 'todos'>('todos');
  const [busqueda, setBusqueda] = useState('');
  const [accion, setAccion] = useState<{ id: string; tipo: 'borrar' } | null>(null);

  // Edición manual del tipo de acceso/plan de un usuario.
  const [editandoAcceso, setEditandoAcceso] = useState<string | null>(null);
  const [formTipo, setFormTipo] = useState<TipoAcceso>('free');
  const [formPlan, setFormPlan] = useState<PlanAcceso>('NONE');
  const [formExpira, setFormExpira] = useState('');
  const [guardandoAcceso, setGuardandoAcceso] = useState(false);

  // Gestión de códigos promocionales.
  const [codigos, setCodigos] = useState<CodigoPromocional[]>([]);
  const [cargandoCodigos, setCargandoCodigos] = useState(true);
  const [errorCodigos, setErrorCodigos] = useState('');
  const [creandoCodigo, setCreandoCodigo] = useState(false);
  const [nuevoCodigo, setNuevoCodigo] = useState({
    codigo: '', tipoAccesoConcedido: 'promotional' as TipoAcceso, planConcedido: 'LIFETIME_FREE' as PlanAcceso,
    duracionDias: '', usosMaximos: '', fechaExpiracion: '', notas: '',
  });
  const [editandoCodigo, setEditandoCodigo] = useState<string | null>(null);
  const [formEdicionCodigo, setFormEdicionCodigo] = useState({
    tipoAccesoConcedido: 'promotional' as TipoAcceso, planConcedido: 'LIFETIME_FREE' as PlanAcceso,
    duracionDias: '', usosMaximos: '', fechaExpiracion: '', notas: '',
  });
  /** Id del código cuyo enlace se acaba de copiar — feedback "¡Copiado!" temporal, mismo patrón que `solicitud-resena.tsx`. */
  const [enlaceCopiado, setEnlaceCopiado] = useState<string | null>(null);
  /**
   * Enlace de invitación para un código — `login-page.tsx` lee `?codigo=`
   * de la URL al cargar y precarga el registro con ese código, sin que el
   * invitado tenga que teclearlo a mano (petición real, 25/08/2026).
   */
  const copiarEnlaceInvitacion = async (codigo: string) => {
    const url = `${window.location.origin}/?codigo=${encodeURIComponent(codigo)}`;
    try {
      await navigator.clipboard.writeText(url);
      setEnlaceCopiado(codigo);
      setTimeout(() => setEnlaceCopiado((actual) => (actual === codigo ? null : actual)), 2000);
    } catch { /* portapapeles no disponible — sin feedback, pero no rompe nada */ }
  };

  // Gestión de costes de infraestructura.
  const [costes, setCostes] = useState<CosteInfraestructura[]>([]);
  const [cargandoCostes, setCargandoCostes] = useState(true);
  const [errorCostes, setErrorCostes] = useState('');
  const [creandoCoste, setCreandoCoste] = useState(false);
  const [nuevoCoste, setNuevoCoste] = useState({
    nombre: '', categoria: '', coste: '', moneda: 'EUR', periodicidad: 'mensual' as Periodicidad, url: '', notas: '',
  });
  const [editandoCoste, setEditandoCoste] = useState<string | null>(null);
  const [formEdicionCoste, setFormEdicionCoste] = useState({
    nombre: '', categoria: '', coste: '', moneda: 'EUR', periodicidad: 'mensual' as Periodicidad, url: '', notas: '',
  });

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

  const cargarCodigos = useCallback(async () => {
    setCargandoCodigos(true);
    setErrorCodigos('');
    try {
      const res = await fetchConAuth('/admin/codigos');
      if (!res.ok) throw new Error('Error al cargar códigos');
      setCodigos(await res.json() as CodigoPromocional[]);
    } catch {
      setErrorCodigos('No se pudieron cargar los códigos.');
    } finally {
      setCargandoCodigos(false);
    }
  }, []);

  const cargarCostes = useCallback(async () => {
    setCargandoCostes(true);
    setErrorCostes('');
    try {
      const res = await fetchConAuth('/admin/costes');
      if (!res.ok) {
        const texto = await res.text().catch(() => '');
        throw new Error(`${res.status} ${texto.slice(0, 300)}`);
      }
      setCostes(await res.json() as CosteInfraestructura[]);
    } catch (e) {
      setErrorCostes(`No se pudieron cargar los costes — ${e instanceof Error ? e.message : 'error desconocido'}`);
    } finally {
      setCargandoCostes(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { cargarCodigos(); }, [cargarCodigos]);
  useEffect(() => { cargarCostes(); }, [cargarCostes]);

  const iniciarEdicionAcceso = (u: UsuarioAdmin) => {
    setEditandoAcceso(u.id);
    setFormTipo(u.acceso?.tipo ?? 'free');
    setFormPlan(u.acceso?.plan ?? 'NONE');
    setFormExpira(u.acceso?.expiraEn ? u.acceso.expiraEn.slice(0, 10) : '');
  };

  const guardarAcceso = async (id: string) => {
    setGuardandoAcceso(true);
    try {
      const res = await fetchConAuth(`/admin/usuarios/${id}/acceso`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: formTipo, plan: formPlan, expiraEn: formExpira ? new Date(formExpira).toISOString() : null }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json() as { acceso: AccesoUsuario };
      setUsuarios(prev => prev.map(u => u.id === id ? { ...u, acceso: data.acceso } : u));
      setEditandoAcceso(null);
    } catch {
      setError('Error al cambiar el acceso.');
    } finally {
      setGuardandoAcceso(false);
    }
  };

  const crearCodigo = async () => {
    if (!nuevoCodigo.codigo.trim()) return;
    setCreandoCodigo(true);
    setErrorCodigos('');
    try {
      const res = await fetchConAuth('/admin/codigos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigo: nuevoCodigo.codigo.trim(),
          tipoAccesoConcedido: nuevoCodigo.tipoAccesoConcedido,
          planConcedido: nuevoCodigo.planConcedido,
          duracionDias: nuevoCodigo.duracionDias ? Number(nuevoCodigo.duracionDias) : null,
          usosMaximos: nuevoCodigo.usosMaximos ? Number(nuevoCodigo.usosMaximos) : null,
          fechaExpiracion: nuevoCodigo.fechaExpiracion ? new Date(nuevoCodigo.fechaExpiracion).toISOString() : null,
          notas: nuevoCodigo.notas.trim(),
        }),
      });
      const data = await res.json() as CodigoPromocional & { error?: string };
      if (!res.ok) { setErrorCodigos(data.error ?? 'Error al crear el código.'); return; }
      setCodigos(prev => [data, ...prev]);
      setNuevoCodigo({ codigo: '', tipoAccesoConcedido: 'promotional', planConcedido: 'LIFETIME_FREE', duracionDias: '', usosMaximos: '', fechaExpiracion: '', notas: '' });
    } catch {
      setErrorCodigos('Error al crear el código.');
    } finally {
      setCreandoCodigo(false);
    }
  };

  const alternarActivoCodigo = async (id: string, activo: boolean) => {
    try {
      const res = await fetchConAuth(`/admin/codigos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo }),
      });
      if (!res.ok) throw new Error();
      setCodigos(prev => prev.map(c => c.id === id ? { ...c, activo } : c));
    } catch {
      setErrorCodigos('Error al actualizar el código.');
    }
  };

  const iniciarEdicionCodigo = (c: CodigoPromocional) => {
    setEditandoCodigo(c.id);
    setFormEdicionCodigo({
      tipoAccesoConcedido: c.tipoAccesoConcedido,
      planConcedido: c.planConcedido,
      duracionDias: c.duracionDias !== null ? String(c.duracionDias) : '',
      usosMaximos: c.usosMaximos !== null ? String(c.usosMaximos) : '',
      fechaExpiracion: c.fechaExpiracion ? c.fechaExpiracion.slice(0, 10) : '',
      notas: c.notas ?? '',
    });
  };

  const guardarEdicionCodigo = async (id: string) => {
    try {
      const res = await fetchConAuth(`/admin/codigos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipoAccesoConcedido: formEdicionCodigo.tipoAccesoConcedido,
          planConcedido: formEdicionCodigo.planConcedido,
          duracionDias: formEdicionCodigo.duracionDias ? Number(formEdicionCodigo.duracionDias) : null,
          usosMaximos: formEdicionCodigo.usosMaximos ? Number(formEdicionCodigo.usosMaximos) : null,
          fechaExpiracion: formEdicionCodigo.fechaExpiracion ? new Date(formEdicionCodigo.fechaExpiracion).toISOString() : null,
          notas: formEdicionCodigo.notas.trim(),
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json() as CodigoPromocional;
      setCodigos(prev => prev.map(c => c.id === id ? data : c));
      setEditandoCodigo(null);
    } catch {
      setErrorCodigos('Error al guardar los cambios del código.');
    }
  };

  const eliminarCodigo = async (id: string) => {
    try {
      await fetchConAuth(`/admin/codigos/${id}`, { method: 'DELETE' });
      setCodigos(prev => prev.filter(c => c.id !== id));
    } catch {
      setErrorCodigos('Error al eliminar el código.');
    }
  };

  const crearCoste = async () => {
    if (!nuevoCoste.nombre.trim() || !nuevoCoste.coste.trim()) return;
    setCreandoCoste(true);
    setErrorCostes('');
    try {
      const res = await fetchConAuth('/admin/costes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: nuevoCoste.nombre.trim(),
          categoria: nuevoCoste.categoria.trim(),
          coste: Number(nuevoCoste.coste),
          moneda: nuevoCoste.moneda.trim() || 'EUR',
          periodicidad: nuevoCoste.periodicidad,
          url: nuevoCoste.url.trim(),
          notas: nuevoCoste.notas.trim(),
        }),
      });
      const texto = await res.text();
      let data: any = null;
      try { data = JSON.parse(texto); } catch { /* respuesta no-JSON (p. ej. error de infraestructura) */ }
      if (!res.ok) {
        const detalle = data?.detalles ? JSON.stringify(data.detalles) : '';
        setErrorCostes(`Error al crear el coste — ${res.status} ${data?.error ?? texto.slice(0, 300)} ${detalle}`);
        return;
      }
      setCostes(prev => [data, ...prev]);
      setNuevoCoste({ nombre: '', categoria: '', coste: '', moneda: 'EUR', periodicidad: 'mensual', url: '', notas: '' });
    } catch (e) {
      setErrorCostes(`Error al crear el coste — ${e instanceof Error ? e.message : 'error de red'}`);
    } finally {
      setCreandoCoste(false);
    }
  };

  const iniciarEdicionCoste = (c: CosteInfraestructura) => {
    setEditandoCoste(c.id);
    setFormEdicionCoste({
      nombre: c.nombre, categoria: c.categoria, coste: String(c.coste), moneda: c.moneda,
      periodicidad: c.periodicidad, url: c.url, notas: c.notas,
    });
  };

  const guardarEdicionCoste = async (id: string) => {
    try {
      const res = await fetchConAuth(`/admin/costes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: formEdicionCoste.nombre.trim(),
          categoria: formEdicionCoste.categoria.trim(),
          coste: Number(formEdicionCoste.coste),
          moneda: formEdicionCoste.moneda.trim() || 'EUR',
          periodicidad: formEdicionCoste.periodicidad,
          url: formEdicionCoste.url.trim(),
          notas: formEdicionCoste.notas.trim(),
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json() as CosteInfraestructura;
      setCostes(prev => prev.map(c => c.id === id ? data : c));
      setEditandoCoste(null);
    } catch {
      setErrorCostes('Error al actualizar el coste.');
    }
  };

  const alternarActivoCoste = async (id: string, activo: boolean) => {
    try {
      const res = await fetchConAuth(`/admin/costes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo }),
      });
      if (!res.ok) throw new Error();
      setCostes(prev => prev.map(c => c.id === id ? { ...c, activo } : c));
    } catch {
      setErrorCostes('Error al actualizar el coste.');
    }
  };

  const eliminarCoste = async (id: string) => {
    try {
      await fetchConAuth(`/admin/costes/${id}`, { method: 'DELETE' });
      setCostes(prev => prev.filter(c => c.id !== id));
    } catch {
      setErrorCostes('Error al eliminar el coste.');
    }
  };

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
  const porEstado = filtro === 'todos' ? usuarios : usuarios.filter(u => u.estado === filtro);
  const q = busqueda.trim().toLowerCase();
  const filtrados = q ? porEstado.filter(u => u.nombre.toLowerCase().includes(q)) : porEstado;

  // Total mensual estimado: solo herramientas activas, el coste anual prorrateado a 12 meses, el de pago único no cuenta como gasto recurrente.
  const totalMensualCostes = costes
    .filter(c => c.activo)
    .reduce((acc, c) => acc + (c.periodicidad === 'mensual' ? c.coste : c.periodicidad === 'anual' ? c.coste / 12 : 0), 0);

  return (
    <div className={styles.modalFondo} onClick={onCerrar}>
      <div className={styles.modalCaja} style={{ maxWidth: 680, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
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

        {/* Pestañas */}
        <div style={{ display: 'flex', gap: '0.3rem', padding: '0 1.25rem', borderBottom: '1px solid var(--borde)' }}>
          {([['usuarios', 'Usuarios'], ['codigos', 'Códigos de acceso'], ['costes', 'Costes']] as const).map(([clave, etiqueta]) => (
            <button
              key={clave}
              onClick={() => setPestana(clave)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '0.7rem 0.9rem',
                fontSize: '0.85rem', fontWeight: pestana === clave ? 700 : 400,
                color: pestana === clave ? 'var(--negro)' : 'var(--topo-claro)',
                borderBottom: `2px solid ${pestana === clave ? 'var(--ocre)' : 'transparent'}`,
                marginBottom: -1,
              }}
            >
              {etiqueta}
            </button>
          ))}
        </div>

        <div style={{ padding: '1.25rem' }}>

          {pestana === 'usuarios' && <>

          {/* Búsqueda */}
          <div className={styles.loginInputWrap} style={{ marginBottom: '0.75rem' }}>
            <span className={styles.loginIconoBadge}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            </span>
            <input
              className={`${styles.input} ${styles.loginInputSimple}`}
              type="text"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o email…"
            />
          </div>

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
              <p>{q ? `Sin resultados para "${busqueda}".` : filtro === 'todos' ? 'Aún no hay usuarios registrados.' : `Sin usuarios en estado "${filtro}".`}</p>
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

                    {/* Acceso / plan */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.76rem', color: 'var(--topo-claro)' }}>
                      <span style={{ background: 'var(--topo-tinte)', color: 'var(--topo)', fontWeight: 600, padding: '2px 8px', borderRadius: 6 }}>
                        {ETIQUETA_TIPO[u.acceso?.tipo ?? 'free']} · {ETIQUETA_PLAN[u.acceso?.plan ?? 'NONE']}
                      </span>
                      {u.acceso?.codigoUsado && <span>Código: <strong style={{ color: 'var(--topo)' }}>{u.acceso.codigoUsado}</strong></span>}
                      {u.acceso?.activadoEn && <span>Activado: {formatoFecha(u.acceso.activadoEn)}</span>}
                      {u.acceso?.expiraEn && <span>Caduca: {formatoFecha(u.acceso.expiraEn)}</span>}
                      <button
                        className={styles.btnIcono}
                        style={{ marginLeft: 'auto', fontSize: '0.72rem', width: 'auto', padding: '2px 8px' }}
                        onClick={() => editandoAcceso === u.id ? setEditandoAcceso(null) : iniciarEdicionAcceso(u)}
                      >
                        {editandoAcceso === u.id ? 'Cancelar' : 'Cambiar acceso'}
                      </button>
                    </div>

                    {editandoAcceso === u.id && (
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center', background: 'var(--papel-alt, var(--blanco))', border: '1px solid var(--borde)', borderRadius: 8, padding: '0.6rem' }}>
                        <select className={styles.input} style={{ fontSize: '0.78rem', width: 'auto' }} value={formTipo} onChange={e => setFormTipo(e.target.value as TipoAcceso)}>
                          {TIPOS_ACCESO.map(t => <option key={t} value={t}>{ETIQUETA_TIPO[t]}</option>)}
                        </select>
                        <select className={styles.input} style={{ fontSize: '0.78rem', width: 'auto' }} value={formPlan} onChange={e => setFormPlan(e.target.value as PlanAcceso)}>
                          {PLANES_ACCESO.map(p => <option key={p} value={p}>{ETIQUETA_PLAN[p]}</option>)}
                        </select>
                        <input
                          className={styles.input} style={{ fontSize: '0.78rem', width: 'auto' }}
                          type="date" value={formExpira} onChange={e => setFormExpira(e.target.value)}
                          title="Fecha de caducidad (vacío = sin caducidad)"
                        />
                        <button className={`${styles.btn} ${styles.btnPrimario}`} style={{ fontSize: '0.76rem' }} disabled={guardandoAcceso} onClick={() => guardarAcceso(u.id)}>
                          {guardandoAcceso ? 'Guardando…' : 'Guardar'}
                        </button>
                      </div>
                    )}

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
            Desactivar un código no afecta a quien ya lo usó — para eso, suspende a esa persona.
          </p>
          </>}

          {pestana === 'codigos' && <>

          {/* Crear código nuevo */}
          <div style={{ background: 'var(--ocre-bg)', border: '1px solid var(--ocre)', borderRadius: 10, padding: '0.9rem 1rem', marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: '0.86rem' }}>Crear código nuevo</p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <input
                className={styles.input} style={{ flex: '1 1 140px', fontSize: '0.82rem', textTransform: 'uppercase' }}
                type="text" placeholder="CÓDIGO" value={nuevoCodigo.codigo}
                onChange={e => setNuevoCodigo(f => ({ ...f, codigo: e.target.value }))}
              />
              <select className={styles.input} style={{ flex: '1 1 120px', fontSize: '0.82rem' }} value={nuevoCodigo.tipoAccesoConcedido} onChange={e => setNuevoCodigo(f => ({ ...f, tipoAccesoConcedido: e.target.value as TipoAcceso }))}>
                {TIPOS_ACCESO.map(t => <option key={t} value={t}>{ETIQUETA_TIPO[t]}</option>)}
              </select>
              <select className={styles.input} style={{ flex: '1 1 140px', fontSize: '0.82rem' }} value={nuevoCodigo.planConcedido} onChange={e => setNuevoCodigo(f => ({ ...f, planConcedido: e.target.value as PlanAcceso }))}>
                {PLANES_ACCESO.map(p => <option key={p} value={p}>{ETIQUETA_PLAN[p]}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <input
                className={styles.input} style={{ flex: '1 1 160px', fontSize: '0.82rem' }}
                type="number" min="1" placeholder="Duración del acceso (días, vacío = sin caducidad)"
                value={nuevoCodigo.duracionDias} onChange={e => setNuevoCodigo(f => ({ ...f, duracionDias: e.target.value }))}
              />
              <input
                className={styles.input} style={{ flex: '1 1 160px', fontSize: '0.82rem' }}
                type="number" min="1" placeholder="Usos máximos (vacío = ilimitado)"
                value={nuevoCodigo.usosMaximos} onChange={e => setNuevoCodigo(f => ({ ...f, usosMaximos: e.target.value }))}
              />
              <input
                className={styles.input} style={{ flex: '1 1 160px', fontSize: '0.82rem' }}
                type="date" title="El código deja de poder usarse a partir de esta fecha (vacío = sin caducidad)"
                value={nuevoCodigo.fechaExpiracion} onChange={e => setNuevoCodigo(f => ({ ...f, fechaExpiracion: e.target.value }))}
              />
            </div>
            <input
              className={styles.input} style={{ fontSize: '0.82rem' }}
              type="text" placeholder="Notas internas (opcional) — p. ej. «para clientes de Instagram»"
              value={nuevoCodigo.notas} onChange={e => setNuevoCodigo(f => ({ ...f, notas: e.target.value }))}
            />
            {errorCodigos && <div style={{ color: 'var(--rojo)', fontSize: '0.8rem' }}>{errorCodigos}</div>}
            <button className={`${styles.btn} ${styles.btnPrimario}`} style={{ fontSize: '0.82rem', alignSelf: 'flex-start' }} disabled={creandoCodigo || !nuevoCodigo.codigo.trim()} onClick={crearCodigo}>
              {creandoCodigo ? 'Creando…' : 'Crear código'}
            </button>
          </div>

          {/* Lista de códigos */}
          {cargandoCodigos ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--topo-claro)' }}>Cargando códigos…</div>
          ) : codigos.length === 0 ? (
            <div className={styles.vacio}>
              <p>Aún no has creado ningún código.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {codigos.map(c => (
                <div key={c.id} style={{
                  background: c.activo ? 'var(--blanco)' : 'var(--topo-tinte)',
                  border: `1px solid ${c.activo ? 'var(--borde)' : 'var(--borde)'}`, opacity: c.activo ? 1 : 0.7,
                  borderRadius: 10, padding: '0.85rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.4rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '0.95rem', letterSpacing: '0.03em' }}>{c.codigo}</span>
                    <span style={{
                      fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                      background: c.activo ? 'var(--verde)' : 'var(--topo-claro)', color: 'var(--blanco)',
                    }}>
                      {c.activo ? 'Activo' : 'Desactivado'}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--topo-claro)' }}>
                    {ETIQUETA_TIPO[c.tipoAccesoConcedido]} · {ETIQUETA_PLAN[c.planConcedido]}
                    {' · '}{c.duracionDias ? `${c.duracionDias} días de acceso` : 'Sin caducidad de acceso'}
                    {' · '}{c.usosMaximos ? `${c.usosActuales}/${c.usosMaximos} usos` : `${c.usosActuales} usos (ilimitado)`}
                    {c.fechaExpiracion ? ` · Canjeable hasta ${formatoFecha(c.fechaExpiracion)}` : ''}
                  </p>
                  {c.notas && <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--topo-claro)', fontStyle: 'italic' }}>{c.notas}</p>}

                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <button
                      className={`${styles.btn} ${styles.btnSecundario}`}
                      style={{ fontSize: '0.74rem' }}
                      onClick={() => copiarEnlaceInvitacion(c.codigo)}
                      title="Copia un enlace que precarga este código en el registro — quien lo abra no tiene que teclear nada"
                    >
                      {enlaceCopiado === c.codigo ? '¡Copiado!' : 'Copiar enlace de invitación'}
                    </button>
                    <button
                      className={`${styles.btn} ${c.activo ? styles.btnPeligro : styles.btnVerde}`}
                      style={{ fontSize: '0.74rem' }}
                      onClick={() => alternarActivoCodigo(c.id, !c.activo)}
                    >
                      {c.activo ? 'Desactivar' : 'Reactivar'}
                    </button>
                    <button
                      className={styles.btnIcono} style={{ fontSize: '0.74rem', width: 'auto', padding: '2px 8px' }}
                      onClick={() => editandoCodigo === c.id ? setEditandoCodigo(null) : iniciarEdicionCodigo(c)}
                    >
                      {editandoCodigo === c.id ? 'Cancelar' : 'Editar'}
                    </button>
                    <button className={styles.btnIcono} style={{ color: 'var(--rojo)' }} title="Eliminar" aria-label="Eliminar" onClick={() => eliminarCodigo(c.id)}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                    </button>
                  </div>

                  {editandoCodigo === c.id && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', background: 'var(--topo-tinte)', borderRadius: 8, padding: '0.6rem' }}>
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <select className={styles.input} style={{ fontSize: '0.78rem', flex: '1 1 120px' }} value={formEdicionCodigo.tipoAccesoConcedido} onChange={e => setFormEdicionCodigo(f => ({ ...f, tipoAccesoConcedido: e.target.value as TipoAcceso }))}>
                          {TIPOS_ACCESO.map(t => <option key={t} value={t}>{ETIQUETA_TIPO[t]}</option>)}
                        </select>
                        <select className={styles.input} style={{ fontSize: '0.78rem', flex: '1 1 140px' }} value={formEdicionCodigo.planConcedido} onChange={e => setFormEdicionCodigo(f => ({ ...f, planConcedido: e.target.value as PlanAcceso }))}>
                          {PLANES_ACCESO.map(p => <option key={p} value={p}>{ETIQUETA_PLAN[p]}</option>)}
                        </select>
                      </div>
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <input
                          className={styles.input} style={{ fontSize: '0.78rem', flex: '1 1 140px' }}
                          type="number" min="1" placeholder="Duración del acceso (días)"
                          value={formEdicionCodigo.duracionDias} onChange={e => setFormEdicionCodigo(f => ({ ...f, duracionDias: e.target.value }))}
                        />
                        <input
                          className={styles.input} style={{ fontSize: '0.78rem', flex: '1 1 140px' }}
                          type="number" min="1" placeholder="Usos máximos"
                          value={formEdicionCodigo.usosMaximos} onChange={e => setFormEdicionCodigo(f => ({ ...f, usosMaximos: e.target.value }))}
                        />
                        <input
                          className={styles.input} style={{ fontSize: '0.78rem', flex: '1 1 140px' }}
                          type="date" title="Canjeable hasta (vacío = sin caducidad)"
                          value={formEdicionCodigo.fechaExpiracion} onChange={e => setFormEdicionCodigo(f => ({ ...f, fechaExpiracion: e.target.value }))}
                        />
                      </div>
                      <input
                        className={styles.input} style={{ fontSize: '0.78rem' }}
                        type="text" placeholder="Notas internas"
                        value={formEdicionCodigo.notas} onChange={e => setFormEdicionCodigo(f => ({ ...f, notas: e.target.value }))}
                      />
                      <button className={`${styles.btn} ${styles.btnPrimario}`} style={{ fontSize: '0.78rem', alignSelf: 'flex-start' }} onClick={() => guardarEdicionCodigo(c.id)}>
                        Guardar cambios
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          </>}

          {pestana === 'costes' && <>

          {/* Total mensual estimado */}
          <div style={{ background: 'var(--topo-tinte)', border: '1px solid var(--borde)', borderRadius: 10, padding: '0.9rem 1rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--topo-claro)', fontWeight: 600 }}>Gasto mensual estimado</span>
            <span style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--negro)' }}>
              {totalMensualCostes.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/mes
            </span>
          </div>

          {/* Añadir herramienta nueva */}
          <div style={{ background: 'var(--ocre-bg)', border: '1px solid var(--ocre)', borderRadius: 10, padding: '0.9rem 1rem', marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: '0.86rem' }}>Añadir herramienta o servicio</p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <input
                className={styles.input} style={{ flex: '1 1 140px', fontSize: '0.82rem' }}
                type="text" placeholder="Nombre (p. ej. Render)" value={nuevoCoste.nombre}
                onChange={e => setNuevoCoste(f => ({ ...f, nombre: e.target.value }))}
              />
              <input
                className={styles.input} style={{ flex: '1 1 140px', fontSize: '0.82rem' }}
                type="text" placeholder="Categoría (p. ej. Hosting)" value={nuevoCoste.categoria}
                onChange={e => setNuevoCoste(f => ({ ...f, categoria: e.target.value }))}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <input
                className={styles.input} style={{ flex: '1 1 100px', fontSize: '0.82rem' }}
                type="number" min="0" step="0.01" placeholder="Coste" value={nuevoCoste.coste}
                onChange={e => setNuevoCoste(f => ({ ...f, coste: e.target.value }))}
              />
              <input
                className={styles.input} style={{ flex: '1 1 70px', fontSize: '0.82rem' }}
                type="text" placeholder="EUR" value={nuevoCoste.moneda}
                onChange={e => setNuevoCoste(f => ({ ...f, moneda: e.target.value }))}
              />
              <select className={styles.input} style={{ flex: '1 1 130px', fontSize: '0.82rem' }} value={nuevoCoste.periodicidad} onChange={e => setNuevoCoste(f => ({ ...f, periodicidad: e.target.value as Periodicidad }))}>
                {(['mensual', 'anual', 'unico'] as const).map(p => <option key={p} value={p}>{ETIQUETA_PERIODICIDAD[p]}</option>)}
              </select>
              <input
                className={styles.input} style={{ flex: '1 1 160px', fontSize: '0.82rem' }}
                type="text" placeholder="URL del panel (opcional)" value={nuevoCoste.url}
                onChange={e => setNuevoCoste(f => ({ ...f, url: e.target.value }))}
              />
            </div>
            <input
              className={styles.input} style={{ fontSize: '0.82rem' }}
              type="text" placeholder="Notas internas (opcional)"
              value={nuevoCoste.notas} onChange={e => setNuevoCoste(f => ({ ...f, notas: e.target.value }))}
            />
            {errorCostes && <div style={{ color: 'var(--rojo)', fontSize: '0.8rem' }}>{errorCostes}</div>}
            <button className={`${styles.btn} ${styles.btnPrimario}`} style={{ fontSize: '0.82rem', alignSelf: 'flex-start' }} disabled={creandoCoste || !nuevoCoste.nombre.trim() || !nuevoCoste.coste.trim()} onClick={crearCoste}>
              {creandoCoste ? 'Añadiendo…' : 'Añadir'}
            </button>
          </div>

          {/* Lista de costes */}
          {cargandoCostes ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--topo-claro)' }}>Cargando costes…</div>
          ) : costes.length === 0 ? (
            <div className={styles.vacio}>
              <p>Aún no has añadido ninguna herramienta.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {costes.map(c => (
                <div key={c.id} style={{
                  background: c.activo ? 'var(--blanco)' : 'var(--topo-tinte)',
                  border: '1px solid var(--borde)', opacity: c.activo ? 1 : 0.7,
                  borderRadius: 10, padding: '0.85rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.4rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                    {c.url ? (
                      <a href={c.url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--negro)' }}>{c.nombre}</a>
                    ) : (
                      <span style={{ fontWeight: 700, fontSize: '0.92rem' }}>{c.nombre}</span>
                    )}
                    {c.categoria && (
                      <span style={{ fontSize: '0.68rem', fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: 'var(--topo-tinte)', color: 'var(--topo)' }}>
                        {c.categoria}
                      </span>
                    )}
                    <span style={{ marginLeft: 'auto', fontWeight: 700, fontSize: '0.9rem' }}>
                      {c.coste.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {c.moneda} <span style={{ fontWeight: 400, color: 'var(--topo-claro)', fontSize: '0.76rem' }}>{ETIQUETA_PERIODICIDAD[c.periodicidad]}</span>
                    </span>
                  </div>

                  {c.notas && <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--topo-claro)', fontStyle: 'italic' }}>{c.notas}</p>}

                  {editandoCoste === c.id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', background: 'var(--topo-tinte)', borderRadius: 8, padding: '0.6rem' }}>
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <input
                          className={styles.input} style={{ fontSize: '0.78rem', flex: '1 1 140px' }}
                          type="text" placeholder="Nombre" value={formEdicionCoste.nombre}
                          onChange={e => setFormEdicionCoste(f => ({ ...f, nombre: e.target.value }))}
                        />
                        <input
                          className={styles.input} style={{ fontSize: '0.78rem', flex: '1 1 140px' }}
                          type="text" placeholder="Categoría" value={formEdicionCoste.categoria}
                          onChange={e => setFormEdicionCoste(f => ({ ...f, categoria: e.target.value }))}
                        />
                      </div>
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <input
                          className={styles.input} style={{ fontSize: '0.78rem', width: 100 }}
                          type="number" min="0" step="0.01" value={formEdicionCoste.coste}
                          onChange={e => setFormEdicionCoste(f => ({ ...f, coste: e.target.value }))}
                        />
                        <input
                          className={styles.input} style={{ fontSize: '0.78rem', width: 70 }}
                          type="text" placeholder="EUR" value={formEdicionCoste.moneda}
                          onChange={e => setFormEdicionCoste(f => ({ ...f, moneda: e.target.value }))}
                        />
                        <select className={styles.input} style={{ fontSize: '0.78rem', width: 'auto' }} value={formEdicionCoste.periodicidad} onChange={e => setFormEdicionCoste(f => ({ ...f, periodicidad: e.target.value as Periodicidad }))}>
                          {(['mensual', 'anual', 'unico'] as const).map(p => <option key={p} value={p}>{ETIQUETA_PERIODICIDAD[p]}</option>)}
                        </select>
                        <input
                          className={styles.input} style={{ fontSize: '0.78rem', flex: '1 1 160px' }}
                          type="text" placeholder="URL del panel" value={formEdicionCoste.url}
                          onChange={e => setFormEdicionCoste(f => ({ ...f, url: e.target.value }))}
                        />
                      </div>
                      <input
                        className={styles.input} style={{ fontSize: '0.78rem' }}
                        type="text" placeholder="Notas internas" value={formEdicionCoste.notas}
                        onChange={e => setFormEdicionCoste(f => ({ ...f, notas: e.target.value }))}
                      />
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button className={`${styles.btn} ${styles.btnPrimario}`} style={{ fontSize: '0.76rem' }} onClick={() => guardarEdicionCoste(c.id)}>Guardar</button>
                        <button className={`${styles.btn} ${styles.btnSecundario}`} style={{ fontSize: '0.76rem' }} onClick={() => setEditandoCoste(null)}>Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <button className={styles.btnIcono} style={{ fontSize: '0.74rem', width: 'auto', padding: '2px 8px' }} onClick={() => iniciarEdicionCoste(c)}>
                        Editar
                      </button>
                      <button
                        className={`${styles.btn} ${c.activo ? styles.btnSecundario : styles.btnVerde}`}
                        style={{ fontSize: '0.74rem' }}
                        onClick={() => alternarActivoCoste(c.id, !c.activo)}
                      >
                        {c.activo ? 'Desactivar' : 'Reactivar'}
                      </button>
                      <button className={styles.btnIcono} style={{ color: 'var(--rojo)', marginLeft: 'auto' }} title="Eliminar" aria-label="Eliminar" onClick={() => eliminarCoste(c.id)}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Pie informativo */}
          <p style={{ marginTop: '1.25rem', fontSize: '0.72rem', color: 'var(--topo-claro)', textAlign: 'center' }}>
            Esta pestaña solo la ves tú como administrador — nunca aparece para los usuarios de la app.
            Desactivar una herramienta la excluye del gasto mensual sin borrar su histórico.
          </p>
          </>}

        </div>
      </div>
    </div>
  );
}
