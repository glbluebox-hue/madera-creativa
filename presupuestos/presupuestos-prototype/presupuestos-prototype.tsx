import { useState, useEffect } from 'react';
import { AsistenteIA } from './asistente-ia.js';
import type { ContextoApp } from './asistente-ia.js';
import { Dashboard } from './dashboard.js';
import { ListaClientes } from './lista-clientes.js';
import { FichaCliente } from './ficha-cliente.js';
import { FormularioCliente } from './formulario-cliente.js';
import { AjustesEmpresa } from './ajustes-empresa.js';
import { Facturas } from './facturas.js';
import { SeccionPresupuestosContenedor } from './seccion-presupuestos-contenedor.js';
import { NotasVista } from './notas-vista.js';
import { SeccionDibujos } from './seccion-dibujos.js';
import { SeccionProveedores } from './seccion-proveedores.js';
import { useProveedores } from './use-proveedores.js';
import { useEmpresa } from './use-empresa.js';
import { useClientes } from './use-clientes.js';
import { useFacturas } from './use-facturas.js';
import { useAuth } from './use-auth.js';
import { LoginPage } from './login-page.js';
import { AjustesBiometria } from './ajustes-biometria.js';
import { PanelAdmin } from './panel-admin.js';
import { useLicencia } from './use-licencia.js';
import { usePush } from './use-push.js';
import { useTema } from './use-tema.js';
import { usePerfil } from './use-perfil.js';
import { AjustesPerfil } from './ajustes-perfil.js';
import type { Cliente, Factura } from './types.js';
import * as api from './api.js';
import logoMadera from './assets/logo.png';
import styles from './styles.module.css';

/** Secciones principales de la app. */
type Seccion = 'inicio' | 'clientes' | 'presupuestos' | 'facturas' | 'notas' | 'proveedores' | 'dibujos';

/**
 * App de presupuestos de cliente para Madera Creativa.
 * Protegida por login — solo el propietario puede acceder.
 */
export function PresupuestosPrototype() {
  const { autenticado, verificando, sesion, login, loginDirecto, registrar, logout } = useAuth();
  // No disparar ninguna petición protegida hasta confirmar que hay un access
  // token válido en memoria — recién autenticado (verificando ya es false
  // desde el principio) o recién confirmado tras recargar la página. Cierra
  // la carrera que dejaba "clientes" vacío de forma intermitente al recargar
  // (Dirección Creativa).
  const listo = autenticado && !verificando;
  const {
    clientes, cargando, cargandoMas: clientesCargandoMas, hayMas: clientesHayMas,
    error, crear, actualizar: actualizarCliente, borrar: borrarCliente, cargar, cargarMas: clientesCargarMas,
  } = useClientes(listo);
  const {
    facturas, resumen: resumenFacturas, cargandoMas: facturasCargandoMas, hayMas: facturasHayMas,
    filtro: filtroFacturas, establecerFiltro: establecerFiltroFacturas,
    guardar: guardarFactura, borrar: borrarFactura, cargarMas: facturasCargarMas,
  } = useFacturas(listo);
  // Solo id+nombre de todos los clientes (no solo la página cargada) — para
  // resolver nombres y selectores (Incremento 1.5).
  const [nombresClientes, setNombresClientes] = useState<{ id: string; nombre: string }[]>([]);
  useEffect(() => {
    if (!listo) return;
    api.obtenerNombresClientes().then(setNombresClientes).catch(() => setNombresClientes([]));
  }, [listo]);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [clienteActual, setClienteActual] = useState<Cliente | null>(null);
  const [creando, setCreando] = useState(false);
  const [ajustes, setAjustes] = useState(false);
  const [ajustesBiometria, setAjustesBiometria] = useState(false);
  const [panelAdmin, setPanelAdmin] = useState(false);
  // Siempre se entra por "Inicio" — a petición del usuario, nunca se
  // recuerda la última sección visitada entre sesiones (antes se
  // persistía en localStorage; se quitó a propósito).
  const [seccion, setSeccion] = useState<Seccion>('inicio');
  const cambiarSeccion = (s: Seccion) => {
    setSeccion(s);
    setMenuMovilAbierto(false);
  };
  // Con un dibujo abierto a pantalla completa, la barra "← Inicio" móvil no
  // debe ni existir en el DOM (ver `SeccionDibujosProps.onEditorAbierto`).
  const [dibujoEditorAbierto, setDibujoEditorAbierto] = useState(false);
  // Menú lateral deslizante en móvil (sustituye a la barra inferior) —
  // reutiliza el mismo <aside> del menú de escritorio, solo cambia cómo se
  // muestra en pantallas estrechas (Dirección Creativa, ajuste móvil).
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false);
  const [asistente, setAsistente] = useState(false);
  const { empresa, actualizar } = useEmpresa(listo, sesion?.esAdmin ?? false);
  // Proveedores aislados por usuario — admin usa clave original, usuarios nuevos tienen espacio propio
  const { proveedores, productos, crearProveedor, actualizarProveedor, borrarProveedor, crearProducto, actualizarProducto, borrarProducto } = useProveedores(listo);
  const { dataTheme, tema, alternar: alternarTema } = useTema();
  const { perfil, actualizar: actualizarPerfil } = usePerfil(listo);
  const [ajustesPerfil, setAjustesPerfil] = useState(false);

  useLicencia(sesion, logout);
  usePush(sesion);

  if (!autenticado) {
    return <LoginPage onLogin={login} onLoginDirecto={loginDirecto} onRegistrar={registrar} />;
  }

  if (verificando) {
    return (
      <div className={styles.vacio} style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span className={styles.loginSpinner} style={{ width: 22, height: 22, borderColor: 'rgba(81,72,63,0.25)', borderTopColor: 'var(--topo)' }} />
      </div>
    );
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
    setNombresClientes((prev) => [{ id: cliente.id, nombre: cliente.nombre }, ...prev]);
    setCreando(false);
    // Abrimos la ficha directamente con el objeto recién creado,
    // sin ir al servidor (que aún puede no tenerlo guardado).
    setSeleccionado(cliente.id);
    setClienteActual(cliente);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /**
   * Crea un cliente nuevo SIN cambiar de sección ni abrir su ficha — usado
   * por "+ Nuevo cliente" dentro del selector de "+ Crear presupuesto"
   * (`PresupuestosListaGlobal`), para no obligar a salir de ese flujo. Es
   * el mismo `crear()` real (misma ficha, mismo guardado) que usa
   * `crearCliente`; la única diferencia es que aquí no se navega a la
   * ficha del cliente porque quien llama sigue con la creación del
   * presupuesto.
   */
  const crearClienteRapido = (cliente: Cliente) => {
    crear(cliente);
    setNombresClientes((prev) => [{ id: cliente.id, nombre: cliente.nombre }, ...prev]);
  };

  const nombreParaMostrar = perfil.nombreMostrar.trim() || sesion?.nombre || '';
  const inicialAvatar = (nombreParaMostrar || '?').trim().charAt(0).toUpperCase();

  return (
    <div className={styles.app} data-theme={dataTheme}>
      <div className={styles.appConSidebar}>
        {/* ===== Botón de menú — solo móvil, abre el mismo menú lateral ===== */}
        <button
          className={styles.botonMenuMovil}
          onClick={() => setMenuMovilAbierto(true)}
          aria-label="Abrir menú"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" /></svg>
        </button>
        {menuMovilAbierto && (
          <div className={styles.menuMovilVelo} onClick={() => setMenuMovilAbierto(false)} aria-hidden="true" />
        )}

        {/* ===== MENÚ LATERAL — escritorio, y como panel deslizante en móvil ===== */}
        <aside className={`${styles.sidebar} ${menuMovilAbierto ? styles.sidebarMovilAbierto : ''}`}>
          <button
            className={styles.sidebarMarca}
            onClick={() => { setAjustes(true); setMenuMovilAbierto(false); }}
            title={sesion?.esAdmin ? 'Ajustes de empresa' : empresa.logo ? 'Cambiar logo' : 'Añade el logo de tu empresa'}
          >
            {empresa.logo ? (
              <img src={empresa.logo} alt={empresa.nombre || 'Logo empresa'} className={styles.sidebarLogoImg} />
            ) : sesion?.esAdmin ? (
              <img src={logoMadera} alt="Madera Creativa" className={styles.sidebarLogoImg} />
            ) : (
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--topo-muy-claro)' }}>Tu logo</span>
            )}
          </button>

          <nav className={styles.sidebarNav} onClick={() => setMenuMovilAbierto(false)}>
            <button
              className={`${styles.sidebarNavItem} ${seccion === 'inicio' ? styles.sidebarNavItemActivo : ''}`}
              onClick={() => { cambiarSeccion('inicio'); volverALista(); }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></svg>
              Inicio
            </button>
            <button
              className={`${styles.sidebarNavItem} ${seccion === 'clientes' ? styles.sidebarNavItemActivo : ''}`}
              onClick={() => { cambiarSeccion('clientes'); volverALista(); }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
              Clientes
            </button>
            <button
              className={`${styles.sidebarNavItem} ${seccion === 'dibujos' ? styles.sidebarNavItemActivo : ''}`}
              onClick={() => { cambiarSeccion('dibujos'); volverALista(); }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" /></svg>
              Pizarra de medición
            </button>
            <button
              className={`${styles.sidebarNavItem} ${seccion === 'presupuestos' ? styles.sidebarNavItemActivo : ''}`}
              onClick={() => { cambiarSeccion('presupuestos'); volverALista(); }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
              Presupuestos
            </button>
            {/* "Crear presupuesto" del sidebar retirado en el Incremento 1 del
                Motor Documental — vuelve en el Incremento 2 apuntando ya al
                editor nuevo (ver ARQUITECTURA-MOTOR-DOCUMENTAL.md). */}
            <button
              className={`${styles.sidebarNavItem} ${seccion === 'facturas' ? styles.sidebarNavItemActivo : ''}`}
              onClick={() => cambiarSeccion('facturas')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>
              Facturas
              {resumenFacturas.numFacturas > 0 && (
                <span className={styles.sidebarNavBadge}>{resumenFacturas.numFacturas}</span>
              )}
            </button>
            <button
              className={`${styles.sidebarNavItem} ${seccion === 'proveedores' ? styles.sidebarNavItemActivo : ''}`}
              onClick={() => { cambiarSeccion('proveedores'); volverALista(); }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /><line x1="12" y1="12" x2="12" y2="16" /><line x1="10" y1="14" x2="14" y2="14" /></svg>
              Proveedores
            </button>
            <button
              className={`${styles.sidebarNavItem} ${seccion === 'notas' ? styles.sidebarNavItemActivo : ''}`}
              onClick={() => { cambiarSeccion('notas'); volverALista(); }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
              Notas
            </button>
          </nav>

          <div className={styles.sidebarUser}>
            <div className={styles.sidebarUserQuien}>
              <button
                className={styles.sidebarAvatar}
                onClick={() => { setAjustesPerfil(true); setMenuMovilAbierto(false); }}
                title="Mi perfil"
                aria-label="Mi perfil"
                style={{ border: 'none', cursor: 'pointer', padding: 0, overflow: 'hidden', fontFamily: 'inherit' }}
              >
                {perfil.foto
                  ? <img src={perfil.foto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                  : inicialAvatar}
              </button>
              <div>
                <div className={styles.sidebarUserNombre}>{nombreParaMostrar}</div>
                <div className={styles.sidebarUserRol}>{sesion?.esAdmin ? 'Administrador' : 'Usuario'}</div>
              </div>
            </div>
            <div className={styles.sidebarAcciones}>
              {sesion?.esAdmin && (
                <button className={styles.sidebarAccionBtn} onClick={() => { setPanelAdmin(true); setMenuMovilAbierto(false); }} title="Panel de usuarios">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                </button>
              )}
              <button
                className={styles.sidebarAccionBtn}
                onClick={() => { setAjustesBiometria(true); setMenuMovilAbierto(false); }}
                title="Acceso biométrico"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 11c0 3.5-1 6.5-2.5 9" /><path d="M8.5 21a25 25 0 0 0 1.8-4.5" />
                  <path d="M15 3.5a9 9 0 0 1 5 8c0 2-0.5 3.5-1 5" /><path d="M12 3a9 9 0 0 0-9 9c0 1.5 0 2.5 0.3 4" />
                  <path d="M6 21a13 13 0 0 0 1.8-4" /><path d="M9 3.5A9 9 0 0 1 21 12c0 0.8 0 1.5-0.1 2" />
                  <path d="M12 7a5 5 0 0 1 5 5c0 1.2-0.1 2.4-0.4 3.5" /><path d="M12 7a5 5 0 0 0-5 5c0 1.5-0.2 3-0.7 4.5" />
                </svg>
              </button>
              <button
                className={styles.sidebarAccionBtn}
                onClick={alternarTema}
                title={tema === 'oscuro' ? 'Modo claro' : 'Modo oscuro'}
              >
                {tema === 'oscuro'
                  ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>
                  : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>}
              </button>
              <button
                className={`${styles.sidebarAccionBtn} ${asistente ? styles.sidebarAccionBtnActivo : ''}`}
                onClick={() => { setAsistente((v) => !v); setMenuMovilAbierto(false); }}
                title="Asistente IA"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><circle cx="9" cy="10" r="1" fill="currentColor" /><circle cx="12" cy="10" r="1" fill="currentColor" /><circle cx="15" cy="10" r="1" fill="currentColor" /></svg>
              </button>
              <button className={styles.sidebarAccionBtn} onClick={logout} title="Cerrar sesión">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
              </button>
            </div>
          </div>
        </aside>

        <div className={styles.contenidoPrincipal}>
      {/* ===== BARRA ATRÁS MÓVIL — aparece en presupuestos, facturas, notas, proveedores y dibujos ===== */}
      {(['presupuestos', 'facturas', 'notas', 'proveedores', 'dibujos'] as string[]).includes(seccion) && !(seccion === 'dibujos' && dibujoEditorAbierto) && (
        <div className={styles.barraVolver}>
          <button
            className={styles.barraVolverBtn}
            onClick={() => { cambiarSeccion('inicio'); volverALista(); }}
          >
            <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6" /></svg>
            Inicio
          </button>
          <p className={styles.barraVolverTitulo}>
            {seccion === 'presupuestos' ? 'Presupuestos' : seccion === 'facturas' ? 'Facturas' : seccion === 'notas' ? 'Notas' : seccion === 'dibujos' ? 'Pizarra de medición' : 'Proveedores'}
          </p>
          <div style={{ width: 56, flexShrink: 0 }} />
        </div>
      )}

      <main className={`${styles.main} ${styles.mainConBottomNav}`}>
        {/* ── SECCIÓN INICIO ── */}
        {seccion === 'inicio' && (
          <Dashboard
            nombre={nombreParaMostrar}
            clientes={clientes}
            facturas={facturas}
            resumen={resumenFacturas}
            onAbrir={(id) => { cambiarSeccion('clientes'); abrirCliente(id); }}
            onBorrarFactura={borrarFactura}
            onActualizarCliente={actualizarCliente}
          />
        )}

        {/* ── SECCIÓN NOTAS ── */}
        {seccion === 'notas' && <NotasVista clientes={nombresClientes} />}

        {/* ── SECCIÓN DIBUJOS (Fase 2.1) ── */}
        {seccion === 'dibujos' && <SeccionDibujos clientes={nombresClientes} onEditorAbierto={setDibujoEditorAbierto} />}

        {/* ── SECCIÓN PROVEEDORES ── */}
        {seccion === 'proveedores' && (
          <SeccionProveedores
            proveedores={proveedores}
            productos={productos}
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
          <SeccionPresupuestosContenedor
            onAbrirCliente={(id) => { cambiarSeccion('clientes'); abrirCliente(id); }}
            clientes={nombresClientes}
            empresa={empresa}
            onActualizarEmpresa={actualizar}
            onCrearCliente={crearClienteRapido}
          />
        )}

        {/* ── SECCIÓN FACTURAS ── */}
        {seccion === 'facturas' && (
          <Facturas
            facturas={facturas}
            resumen={resumenFacturas}
            filtro={filtroFacturas}
            onFiltroChange={establecerFiltroFacturas}
            hayMas={facturasHayMas}
            cargandoMas={facturasCargandoMas}
            onCargarMas={facturasCargarMas}
            clientes={nombresClientes}
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
                clientes={nombresClientes}
                empresa={empresa}
                onActualizarEmpresa={actualizar}
                onVolver={volverALista}
                onActualizar={(c) => { setClienteActual(c); actualizarCliente(c); }}
                onBorrar={(id) => { borrarCliente(id); volverALista(); }}
                onGuardarFactura={(f: Factura) => guardarFactura(f)}
                proveedores={proveedores}
                onCrearProveedor={crearProveedor}
              />
            ) : cargando && clientes.length === 0 ? (
              <div className={styles.vacio}>
                <div className={styles.vacioIcono} style={{ display: 'flex', justifyContent: 'center' }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                </div>
                <p>Cargando tus clientes…</p>
              </div>
            ) : (
              <>
                {error && clientes.length === 0 && (
                  <div style={{ padding: '0.75rem 1rem', background: 'var(--rojo-bg)', borderRadius: 6, marginBottom: '1rem', fontSize: '0.82rem', color: 'var(--rojo)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12" y2="17" /></svg>
                      Sin conexión con el servidor — mostrando datos locales
                    </span>
                    <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={cargar}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4, verticalAlign: -2 }}><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
                      Reintentar
                    </button>
                  </div>
                )}
                <ListaClientes
                  clientes={clientes}
                  onNuevo={() => setCreando(true)}
                  onAbrir={abrirCliente}
                  hayMas={clientesHayMas}
                  cargandoMas={clientesCargandoMas}
                  onCargarMas={clientesCargarMas}
                />
              </>
            )}
          </>
        )}
      </main>
        </div>
      </div>

      {creando && (
        <FormularioCliente onGuardar={crearCliente} onCerrar={() => setCreando(false)} />
      )}

      {ajustes && (
        <AjustesEmpresa empresa={empresa} onGuardar={actualizar} onCerrar={() => setAjustes(false)} />
      )}

      {ajustesBiometria && (
        <AjustesBiometria onCerrar={() => setAjustesBiometria(false)} />
      )}

      {ajustesPerfil && (
        <AjustesPerfil
          perfil={perfil}
          nombreAcceso={sesion?.nombre || ''}
          onGuardar={actualizarPerfil}
          onCambioAcceso={loginDirecto}
          onCerrar={() => setAjustesPerfil(false)}
        />
      )}

      {panelAdmin && sesion?.esAdmin && <PanelAdmin onCerrar={() => setPanelAdmin(false)} />}


      {/* Asistente IA — botón flotante siempre visible (además del icono del
          menú lateral, que en móvil queda oculto hasta abrir el menú) */}
      <AsistenteIA
        abiertoProp={asistente}
        onCambiarAbierto={setAsistente}
        contexto={{ seccionActual: seleccionado ? `ficha-cliente:${clienteActual?.nombre || ''}` : seccion, clienteAbierto: clienteActual?.nombre } as ContextoApp}
        clientes={nombresClientes}
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
