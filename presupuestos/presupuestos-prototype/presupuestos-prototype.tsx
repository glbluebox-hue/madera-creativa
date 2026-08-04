import { useState } from 'react';
import { AsistenteIA } from './asistente-ia.js';
import type { ContextoApp } from './asistente-ia.js';
import { ListaClientes } from './lista-clientes.js';
import { FichaCliente } from './ficha-cliente.js';
import { FormularioCliente } from './formulario-cliente.js';
import { AjustesEmpresa } from './ajustes-empresa.js';
import { Facturas } from './facturas.js';
import { SeccionPresupuestos } from './seccion-presupuestos.js';
import { NotasGlobales } from './notas-globales.js';
import { SeccionProveedores } from './seccion-proveedores.js';
import { useProveedores } from './use-proveedores.js';
import { useEmpresa } from './use-empresa.js';
import { useClientes } from './use-clientes.js';
import { useFacturas } from './use-facturas.js';
import { useAuth } from './use-auth.js';
import { LoginPage } from './login-page.js';
import { AjustesAlmacenamiento } from './ajustes-almacenamiento.js';
import { PanelAdmin } from './panel-admin.js';
import { useLicencia } from './use-licencia.js';
import { usePush } from './use-push.js';
import type { Cliente, Factura } from './types.js';
import * as api from './api.js';
import logoMadera from './assets/logo.png';
import styles from './styles.module.css';

/** Secciones principales de la app. */
type Seccion = 'clientes' | 'presupuestos' | 'facturas' | 'notas' | 'proveedores';

/**
 * App de presupuestos de cliente para Madera Creativa.
 * Protegida por login — solo el propietario puede acceder.
 */
export function PresupuestosPrototype() {
  const { autenticado, sesion, storagePrefix, login, loginDirecto, registrar, logout, actualizarAlmacenamiento } = useAuth();
  const { clientes, cargando, error, crear, actualizar: actualizarCliente, cargar } = useClientes(autenticado);
  const { facturas, guardar: guardarFactura, borrar: borrarFactura } = useFacturas();
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [clienteActual, setClienteActual] = useState<Cliente | null>(null);
  const [creando, setCreando] = useState(false);
  const [ajustes, setAjustes] = useState(false);
  const [ajustesAlmac, setAjustesAlmac] = useState(false);
  const [panelAdmin, setPanelAdmin] = useState(false);
  // Persistir la sección activa — al recargar se mantiene donde estaba el usuario
  const [seccion, setSeccion] = useState<Seccion>(() => {
    try { return (localStorage.getItem('mc_seccion') as Seccion) || 'clientes'; } catch { return 'clientes'; }
  });
  const cambiarSeccion = (s: Seccion) => {
    try { localStorage.setItem('mc_seccion', s); } catch { /* noop */ }
    setSeccion(s);
  };
  const [asistente, setAsistente] = useState(false);
  const { empresa, actualizar } = useEmpresa(sesion?.esAdmin ?? false);
  // Proveedores aislados por usuario — admin usa clave original, usuarios nuevos tienen espacio propio
  const prefijoProv = sesion?.esAdmin ? 'admin' : (sesion?.usuarioId || storagePrefix || 'mc');
  const { proveedores, productos, crearProveedor, actualizarProveedor, borrarProveedor, crearProducto, actualizarProducto, borrarProducto } = useProveedores(prefijoProv);

  useLicencia(sesion, logout);
  usePush(sesion);

  if (!autenticado) {
    return <LoginPage onLogin={login} onLoginDirecto={loginDirecto} onRegistrar={registrar} />;
  }

  const abrirCliente = async (id: string) => {
    cambiarSeccion('clientes');
    setSeleccionado(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    try {
      const completo = await api.obtenerCliente(id);
      setClienteActual(completo);
    } catch {
      setClienteActual(clientes.find((c) => c.id === id) || null);
    }
  };

  const volverALista = () => {
    setSeleccionado(null);
    setClienteActual(null);
  };

  const crearCliente = (cliente: Cliente) => {
    crear(cliente);
    setCreando(false);
    // Abrimos la ficha directamente con el objeto recién creado,
    // sin ir al servidor (que aún puede no tenerlo guardado).
    setSeleccionado(cliente.id);
    setClienteActual(cliente);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const totalIngresos = facturas.filter((f) => f.tipo === 'ingreso').reduce((s, f) => s + f.importe, 0);
  const totalGastos = facturas.filter((f) => f.tipo === 'gasto').reduce((s, f) => s + f.importe, 0);

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          {/* Logo — clic abre ajustes de empresa */}
          <button
            className={styles.headerMarca}
            onClick={() => setAjustes(true)}
            title={sesion?.esAdmin ? 'Ajustes de empresa' : empresa.logo ? 'Cambiar logo' : 'Añade el logo de tu empresa'}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
          >
            {empresa.logo ? (
              <img
                src={empresa.logo}
                alt={empresa.nombre || 'Logo empresa'}
                className={styles.logoImg}
              />
            ) : sesion?.esAdmin ? (
              <img src={logoMadera} alt="Madera Creativa" className={styles.logoImg} />
            ) : (
              /* Placeholder para usuarios sin logo */
              <div style={{
                width: 40, height: 40, borderRadius: 8,
                border: '2px dashed var(--borde)',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                fontSize: '0.45rem', color: 'var(--topo-muy-claro)',
                fontWeight: 600, letterSpacing: '0.03em', textAlign: 'center',
                lineHeight: 1.2, padding: '0.2rem', gap: 2,
                cursor: 'pointer',
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                <span>Tu logo</span>
              </div>
            )}
          </button>

          {/* Navegación en pill */}
          <nav className={styles.headerNav}>
            <button
              className={`${styles.headerNavBtn} ${seccion === 'clientes' ? styles.headerNavBtnActivo : ''}`}
              onClick={() => { cambiarSeccion('clientes'); volverALista(); }}
            >
              Clientes
            </button>
            <button
              className={`${styles.headerNavBtn} ${seccion === 'presupuestos' ? styles.headerNavBtnActivo : ''}`}
              onClick={() => { cambiarSeccion('presupuestos'); volverALista(); }}
            >
              Presupuestos
            </button>
            <button
              className={`${styles.headerNavBtn} ${seccion === 'facturas' ? styles.headerNavBtnActivo : ''}`}
              onClick={() => cambiarSeccion('facturas')}
            >
              Facturas
              {facturas.length > 0 && (
                <span className={styles.headerNavBadge}>{facturas.length}</span>
              )}
            </button>
            <button
              className={`${styles.headerNavBtn} ${seccion === 'proveedores' ? styles.headerNavBtnActivo : ''}`}
              onClick={() => { cambiarSeccion('proveedores'); volverALista(); }}
            >
              Proveedores
            </button>
            <button
              className={`${styles.headerNavBtn} ${seccion === 'notas' ? styles.headerNavBtnActivo : ''}`}
              onClick={() => { cambiarSeccion('notas'); volverALista(); }}
            >
              Notas
            </button>
          </nav>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {/* Indicador de almacenamiento — solo para usuarios no admin */}
            {!sesion?.esAdmin && (
              <button
                onClick={() => setAjustesAlmac(true)}
                title={sesion?.almacenamiento === 'supabase' ? 'Almacenamiento en la nube' : 'Almacenamiento local'}
                style={{ background: 'none', border: '1px solid var(--borde)', borderRadius: 8, cursor: 'pointer', width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}
              >
                {sesion?.almacenamiento === 'supabase' ? '☁️' : '📱'}
              </button>
            )}
            {/* Botón admin — solo visible para holamaderacreativa */}
            {sesion?.esAdmin && (
              <button
                onClick={() => setPanelAdmin(true)}
                title="Panel de usuarios"
                style={{
                  position: 'relative',
                  background: 'none', border: '1px solid var(--borde)',
                  borderRadius: 8, cursor: 'pointer',
                  width: 34, height: 34,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--topo)', fontSize: '1rem',
                }}
              >
                👥
              </button>
            )}
            {/* Botón asistente IA en cabecera */}
            <button
              onClick={() => setAsistente(v => !v)}
              title="Asistente IA"
              style={{
                background: asistente ? '#4a3828' : 'none',
                border: '1px solid',
                borderColor: asistente ? '#4a3828' : 'var(--borde)',
                borderRadius: 8,
                cursor: 'pointer',
                width: 34,
                height: 34,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: asistente ? '#fff' : 'var(--topo)',
                transition: 'all 0.15s',
                flexShrink: 0,
              }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                <circle cx="9" cy="10" r="1" fill="currentColor"/><circle cx="12" cy="10" r="1" fill="currentColor"/><circle cx="15" cy="10" r="1" fill="currentColor"/>
              </svg>
            </button>
            <button className={styles.btnCerrarSesion} onClick={logout} title="Cerrar sesión">Salir</button>
          </div>
        </div>
      </header>

      {/* ===== BARRA ATRÁS MÓVIL — aparece en presupuestos, facturas y notas ===== */}
      {(['presupuestos', 'facturas', 'notas', 'proveedores'] as string[]).includes(seccion) && (
        <div className={styles.barraVolver}>
          <button
            className={styles.barraVolverBtn}
            onClick={() => { cambiarSeccion('clientes'); volverALista(); }}
          >
            <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6" /></svg>
            Inicio
          </button>
          <p className={styles.barraVolverTitulo}>
            {seccion === 'presupuestos' ? 'Presupuestos' : seccion === 'facturas' ? 'Facturas' : seccion === 'notas' ? '📋 Notas' : '🏭 Proveedores'}
          </p>
          <div style={{ width: 56, flexShrink: 0 }} />
        </div>
      )}

      <main className={`${styles.main} ${styles.mainConBottomNav}`}>
        {/* ── SECCIÓN NOTAS ── */}
        {seccion === 'notas' && <NotasGlobales />}

        {/* ── SECCIÓN PROVEEDORES ── */}
        {seccion === 'proveedores' && (
          <SeccionProveedores
            proveedores={proveedores}
            productos={productos}
            facturas={facturas}
            onCrearProveedor={crearProveedor}
            onActualizarProveedor={actualizarProveedor}
            onBorrarProveedor={borrarProveedor}
            onCrearProducto={crearProducto}
            onActualizarProducto={actualizarProducto}
            onBorrarProducto={borrarProducto}
          />
        )}

        {/* ── SECCIÓN PRESUPUESTOS ── */}
        {seccion === 'presupuestos' && (
          <SeccionPresupuestos
            clientes={clientes}
            onAbrirCliente={(id) => { cambiarSeccion('clientes'); abrirCliente(id); }}
          />
        )}

        {/* ── SECCIÓN FACTURAS ── */}
        {seccion === 'facturas' && (
          <Facturas
            facturas={facturas}
            clientes={clientes.map((c) => ({ id: c.id, nombre: c.nombre }))}
            proveedores={proveedores}
            onGuardar={guardarFactura}
            onBorrar={borrarFactura}
            onCrearProveedor={crearProveedor}
          />
        )}

        {/* ── SECCIÓN CLIENTES ── */}
        {seccion === 'clientes' && (
          <>
            {/* La ficha siempre tiene prioridad, independientemente del estado de carga */}
            {clienteActual ? (
              <FichaCliente
                cliente={clienteActual}
                clientes={clientes.map((c) => ({ id: c.id, nombre: c.nombre }))}
                facturas={facturas}
                onVolver={volverALista}
                onActualizar={(c) => { setClienteActual(c); actualizarCliente(c); }}
                onGuardarFactura={(f: Factura) => guardarFactura(f)}
                proveedores={proveedores}
                onCrearProveedor={crearProveedor}
              />
            ) : cargando && clientes.length === 0 ? (
              <div className={styles.vacio}>
                <div className={styles.vacioIcono}>⏳</div>
                <p>Cargando tus clientes…</p>
              </div>
            ) : (
              <>
                {error && clientes.length === 0 && (
                  <div style={{ padding: '0.75rem 1rem', background: 'var(--rojo-bg)', borderRadius: 6, marginBottom: '1rem', fontSize: '0.82rem', color: 'var(--rojo)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>⚠️ Sin conexión con el servidor — mostrando datos locales</span>
                    <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={cargar}>🔄 Reintentar</button>
                  </div>
                )}
                <ListaClientes
                  clientes={clientes}
                  onNuevo={() => setCreando(true)}
                  onAbrir={abrirCliente}
                />
              </>
            )}
          </>
        )}
      </main>

      {creando && (
        <FormularioCliente onGuardar={crearCliente} onCerrar={() => setCreando(false)} />
      )}

      {ajustes && (
        <AjustesEmpresa empresa={empresa} onGuardar={actualizar} onCerrar={() => setAjustes(false)} />
      )}

      {ajustesAlmac && sesion && (
        <AjustesAlmacenamiento
          sesion={sesion}
          onActualizar={actualizarAlmacenamiento}
          onCerrar={() => setAjustesAlmac(false)}
        />
      )}

      {panelAdmin && sesion?.esAdmin && <PanelAdmin onCerrar={() => setPanelAdmin(false)} />}

      {/* ===== BARRA NAV INFERIOR — MÓVIL ===== */}
      {/* Ocultar cuando hay un modal abierto para que no tape los botones */}
      <nav className={styles.bottomNav} style={creando || ajustes || ajustesAlmac || panelAdmin ? { display: 'none' } : undefined}>
        <button
          className={`${styles.bottomNavBtn} ${seccion === 'clientes' ? styles.bottomNavBtnActivo : ''}`}
          onClick={() => { cambiarSeccion('clientes'); volverALista(); }}
        >
          <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          Clientes
        </button>
        <button
          className={`${styles.bottomNavBtn} ${seccion === 'presupuestos' ? styles.bottomNavBtnActivo : ''}`}
          onClick={() => { cambiarSeccion('presupuestos'); volverALista(); }}
        >
          <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          Presupuestos
        </button>
        <button
          className={`${styles.bottomNavBtn} ${seccion === 'facturas' ? styles.bottomNavBtnActivo : ''}`}
          onClick={() => cambiarSeccion('facturas')}
        >
          <svg viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
          Facturas
        </button>
        <button
          className={`${styles.bottomNavBtn} ${seccion === 'proveedores' ? styles.bottomNavBtnActivo : ''}`}
          onClick={() => { cambiarSeccion('proveedores'); volverALista(); }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>
          Proveedores
        </button>
        <button
          className={`${styles.bottomNavBtn} ${seccion === 'notas' ? styles.bottomNavBtnActivo : ''}`}
          onClick={() => { cambiarSeccion('notas'); volverALista(); }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>
          Notas
        </button>
      </nav>

      {/* Asistente IA — sin FAB flotante, controlado desde cabecera */}
      <AsistenteIA
        sinFab
        abiertoProp={asistente}
        onCerrar={() => setAsistente(false)}
        contexto={{ seccionActual: seleccionado ? `ficha-cliente:${clienteActual?.nombre || ''}` : seccion, clienteAbierto: clienteActual?.nombre } as ContextoApp}
        clientes={clientes}
        onNavegar={(s) => { cambiarSeccion(s as Seccion); volverALista(); }}
        onAbrirCliente={abrirCliente}
        onCrearCliente={() => setCreando(true)}
      />

      {/* Pie sutil — siempre visible dentro de la app */}
      <div style={{
        textAlign: 'center',
        padding: '0.5rem',
        fontSize: '0.6rem',
        color: 'var(--topo-muy-claro)',
        opacity: 0.45,
        letterSpacing: '0.04em',
        userSelect: 'none',
        paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))',
      }}>
        Desarrollado por Madera Creativa
      </div>

    </div>
  );
}
