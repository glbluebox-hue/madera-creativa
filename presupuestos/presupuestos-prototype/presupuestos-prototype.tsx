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
import { InteligenciaPreciosVista } from './inteligencia-precios-vista.js';
import { NotasVista } from './notas-vista.js';
import { CalendarioVista } from './calendario-vista.js';
import type { ElementoCalendario } from './calendario-modelo.js';
import { CodigosQRVista } from './codigos-qr-vista.js';
import { SeccionDibujos } from './seccion-dibujos.js';
import { SeccionProveedores } from './seccion-proveedores.js';
import { useProveedores } from './use-proveedores.js';
import { useEmpresa } from './use-empresa.js';
import { useProyectos } from './use-proyectos.js';
import { useFacturas } from './use-facturas.js';
import { useAuth } from './use-auth.js';
import { LoginPage } from './login-page.js';
import { AjustesBiometria } from './ajustes-biometria.js';
import { PanelAdmin } from './panel-admin.js';
import { useLicencia } from './use-licencia.js';
import { usePush } from './use-push.js';
import { useTema } from './use-tema.js';
import { usePerfil } from './use-perfil.js';
import { usePrivacidad } from './use-privacidad.js';
import { AjustesPerfil } from './ajustes-perfil.js';
import { PanelNotificaciones } from './panel-notificaciones.js';
import { SoportePanel } from './soporte-panel.js';
import { TutorialOverlay } from './TutorialOverlay.js';
import { useTutorial } from './use-tutorial.js';
import { TUTORIAL_APP, TUTORIAL_FACTURAS, TUTORIAL_PROVEEDORES } from './tutorial-definiciones.js';
import { esNuncaVisto } from './tutorial-progreso-adapter.js';
import { useInactividad } from './use-inactividad.js';
import { Z_DESPLEGABLE } from './z-index.js';
import type { Cliente, Proyecto, Factura } from './types.js';
import * as api from './api.js';
import logoMadera from './assets/logo.png';
import styles from './styles.module.css';

/** Secciones principales de la app. */
type Seccion = 'inicio' | 'clientes' | 'presupuestos' | 'inteligenciaPrecios' | 'facturas' | 'notas' | 'calendario' | 'proveedores' | 'dibujos' | 'codigosQR';

/** Nombre corto de cada sección para el botón "volver" de la barra móvil — a diferencia del título de esa misma barra (más ancho, admite el nombre completo), este botón es solo icono+palabra en el estilo iOS, así que usa una versión abreviada cuando el nombre completo no cabría bien. */
const ETIQUETA_SECCION_CORTA: Record<Seccion, string> = {
  inicio: 'Inicio', clientes: 'Clientes', presupuestos: 'Presupuestos', inteligenciaPrecios: 'Precios',
  facturas: 'Facturas', notas: 'Notas', calendario: 'Calendario', proveedores: 'Proveedores',
  dibujos: 'Pizarra', codigosQR: 'Código QR',
};

/**
 * App de presupuestos de cliente para Madera Creativa.
 * Protegida por login — solo el propietario puede acceder.
 */
export function PresupuestosPrototype() {
  const { autenticado, verificando, sesion, storagePrefix, login, loginDirecto, registrar, logout } = useAuth();
  // No disparar ninguna petición protegida hasta confirmar que hay un access
  // token válido en memoria — recién autenticado (verificando ya es false
  // desde el principio) o recién confirmado tras recargar la página. Cierra
  // la carrera que dejaba "clientes" vacío de forma intermitente al recargar
  // (Dirección Creativa).
  const listo = autenticado && !verificando;
  const {
    proyectos, cargando, error, actualizar: actualizarProyecto, actualizarRecordatorio,
    borrar: borrarProyecto, cargar,
  } = useProyectos(listo);
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
  const [proyectoActual, setProyectoActual] = useState<Proyecto | null>(null);
  const [clienteActualIdentidad, setClienteActualIdentidad] = useState<Cliente | null>(null);
  const [creando, setCreando] = useState(false);
  const [ajustes, setAjustes] = useState(false);
  const [ajustesBiometria, setAjustesBiometria] = useState(false);
  const [panelAdmin, setPanelAdmin] = useState(false);
  // Siempre se entra por "Inicio" — a petición del usuario, nunca se
  // recuerda la última sección visitada entre sesiones (antes se
  // persistía en localStorage; se quitó a propósito). Única excepción:
  // llegar desde la notificación de recordatorio de horas, que sí debe
  // abrir directamente en Clientes (petición del usuario, 18/08/2026) —
  // un parámetro de un solo uso en la URL, nunca algo persistente.
  const [seccion, setSeccion] = useState<Seccion>(() => {
    const abrirEn = new URLSearchParams(window.location.search).get('accion');
    return abrirEn === 'clientes' ? 'clientes' : 'inicio';
  });
  /**
   * Historial de secciones visitadas en ESTA sesión (en memoria, se
   * pierde al recargar — no contradice "siempre se entra por Inicio" de
   * arriba, que es sobre no recordar nada ENTRE sesiones). Petición
   * explícita del usuario, 31/08/2026: "volver" debe llevar a la pestaña
   * en la que se estaba antes, no siempre a Inicio (p. ej. entrar al
   * Calendario desde Proveedores y que "volver" te devuelva a
   * Proveedores). Tope de 20 para no crecer sin límite en una sesión muy
   * larga.
   */
  const [historialSecciones, setHistorialSecciones] = useState<Seccion[]>([]);
  const cambiarSeccion = (s: Seccion) => {
    if (s !== seccion) setHistorialSecciones((h) => [...h, seccion].slice(-20));
    setSeccion(s);
    setMenuMovilAbierto(false);
  };
  /** Vuelve a la sección anterior del historial (ver comentario arriba); si no hay ninguna, cae a Inicio. Además de cambiar de sección, restaura el estado de "lista" (igual que ya hace cada botón del menú lateral) para no dejar una ficha/detalle a medias de la sección de la que se sale. */
  const volverSeccionAnterior = () => {
    if (historialSecciones.length === 0) { cambiarSeccion('inicio'); volverALista(); return; }
    const anterior = historialSecciones[historialSecciones.length - 1];
    setHistorialSecciones((h) => h.slice(0, -1));
    setSeccion(anterior);
    setMenuMovilAbierto(false);
    volverALista();
  };
  useEffect(() => {
    // El parámetro `?accion=clientes` es de un solo uso — se limpia de la
    // URL nada más leerlo (ya en el `useState` de arriba) para que un
    // recargado posterior no se quede pegado a Clientes.
    if (new URLSearchParams(window.location.search).has('accion')) {
      window.history.replaceState(null, '', window.location.pathname);
    }
    // Con la app ya abierta (misma pestaña, sin recargar), tocar la
    // notificación no dispara este `useState` de arriba — el service
    // worker manda un mensaje en su lugar (ver `notificationclick` en
    // sw.js) para llevar igualmente a Clientes.
    const alRecibirMensaje = (e: MessageEvent) => {
      if (e.data?.tipo === 'ir-a-clientes') cambiarSeccion('clientes');
    };
    navigator.serviceWorker?.addEventListener('message', alRecibirMensaje);
    return () => navigator.serviceWorker?.removeEventListener('message', alRecibirMensaje);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Con un dibujo abierto a pantalla completa, la barra "← Inicio" móvil no
  // debe ni existir en el DOM (ver `SeccionDibujosProps.onEditorAbierto`).
  const [dibujoEditorAbierto, setDibujoEditorAbierto] = useState(false);
  // Menú lateral deslizante en móvil (sustituye a la barra inferior) —
  // reutiliza el mismo <aside> del menú de escritorio, solo cambia cómo se
  // muestra en pantallas estrechas (Dirección Creativa, ajuste móvil).
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false);
  const [asistente, setAsistente] = useState(false);
  /** Centro de ayuda (Fase E, 25/08/2026) — menú del botón "Tutorial": repetir el tour completo o ir directo a la ayuda de una sección concreta. */
  const [centroAyudaAbierto, setCentroAyudaAbierto] = useState(false);
  const { empresa, cargando: empresaCargando, actualizar } = useEmpresa(listo, sesion?.esAdmin ?? false);
  // Proveedores aislados por usuario — admin usa clave original, usuarios nuevos tienen espacio propio
  const { proveedores, productos, crearProveedor, actualizarProveedor, borrarProveedor, fusionarProveedores, crearProducto, actualizarProducto, borrarProducto } = useProveedores(listo);
  const { dataTheme, tema, alternar: alternarTema } = useTema();
  const { privado, alternar: alternarPrivacidad } = usePrivacidad();
  const { perfil, actualizar: actualizarPerfil } = usePerfil(listo);
  const [ajustesPerfil, setAjustesPerfil] = useState(false);
  const [panelNotificaciones, setPanelNotificaciones] = useState(false);
  /** "Comentarios y sugerencias" (26/08/2026) — hilo de soporte del usuario con el admin. */
  const [soportePanel, setSoportePanel] = useState(false);
  // Sistema de tutoriales interactivos (Fase 1, 24/08/2026) — motor +
  // overlay ya reales; `storagePrefix` reutiliza el mismo namespacing por
  // usuario que ya usa el resto de la app (`use-auth.ts`).
  const tutorial = useTutorial(storagePrefix);
  /**
   * Inicio automático (Fase A, 25/08/2026) — un usuario "nunca visto" es
   * quien no tiene NINGÚN progreso guardado para `TUTORIAL_APP`
   * (`progresoDe` devuelve `null`): ni en_progreso, ni completado, ni
   * saltado. Se comprueba una vez por sesión autenticada, no en cada
   * render — abrir ya marca `en_progreso` solo (mismo camino que el botón
   * manual "Tutorial", ver `use-tutorial.ts`), así que no hace falta
   * ninguna acción nueva para "Empezar": el primer paso que aparece YA
   * cuenta como tutorial iniciado.
   */
  useEffect(() => {
    if (!autenticado) return;
    if (esNuncaVisto(tutorial.progresoDe(TUTORIAL_APP.id))) tutorial.abrir(TUTORIAL_APP);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autenticado]);

  /**
   * Onboarding contextual (Fase D, 25/08/2026) — al entrar por primera vez
   * a Facturas o Proveedores (nunca durante el recorrido inicial, ni
   * disparado por el botón "Tutorial"), se abre un tutorial corto solo de
   * esa sección. Dos guardas para no repetirse ni chocar con el tour
   * principal: (1) si YA hay un tutorial activo (p. ej. el recorrido
   * inicial en curso, que navega solo entre secciones) no se interrumpe
   * abriendo otro encima; (2) si el recorrido inicial ya está
   * `completado`, el usuario ya vio esta misma explicación ahí — no hace
   * falta repetirla por sección.
   */
  useEffect(() => {
    if (!autenticado) return;
    if (tutorial.estado.fase !== 'inactivo') return;
    if (tutorial.progresoDe(TUTORIAL_APP.id)?.estado === 'completado') return;
    const contextual = seccion === 'facturas' ? TUTORIAL_FACTURAS : seccion === 'proveedores' ? TUTORIAL_PROVEEDORES : null;
    if (contextual && esNuncaVisto(tutorial.progresoDe(contextual.id))) tutorial.abrir(contextual);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seccion]);

  // Cierre de sesión por inactividad (Ajustes de empresa) — desactivado por defecto (`tiempoInactividadMin: null`).
  useInactividad(empresa.tiempoInactividadMin, autenticado, logout);

  useLicencia(sesion, logout);
  const { estado: estadoPush, error: errorPush, activar: activarPush } = usePush(sesion);

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

  const abrirProyecto = async (id: string) => {
    cambiarSeccion('clientes');
    setSeleccionado(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    try {
      const proyectoFresco = await api.obtenerProyecto(id);
      setProyectoActual(proyectoFresco);
      setClienteActualIdentidad(await api.obtenerCliente(proyectoFresco.clienteId));
    } catch {
      setProyectoActual(null);
      setClienteActualIdentidad(null);
    }
  };

  const volverALista = () => {
    setSeleccionado(null);
    setProyectoActual(null);
    setClienteActualIdentidad(null);
  };

  /**
   * "Acceder al elemento de origen" desde el Calendario (30/08/2026) — cada
   * tipo navega a donde de verdad vive ese dato; evento/recordatorio no
   * llega aquí (el propio `CalendarioVista` los abre en su modal, al no
   * tener otra sección propia). Proyecto/tarea/factura con `proyectoId`
   * abren directamente esa ficha (mismo camino que `abrirProyecto`); una
   * nota o factura sin proyecto asociado, o un cliente recién añadido, solo
   * cambian de sección — profundizar más ahí exigiría que Notas/Facturas
   * supieran abrir directamente un elemento concreto, que hoy no hacen.
   */
  const abrirElementoCalendario = (elemento: ElementoCalendario) => {
    if (elemento.proyectoId) { cambiarSeccion('clientes'); abrirProyecto(elemento.proyectoId); return; }
    if (elemento.tipo === 'nota') { cambiarSeccion('notas'); return; }
    if (elemento.tipo === 'factura') { cambiarSeccion('facturas'); return; }
    if (elemento.tipo === 'cliente') { cambiarSeccion('clientes'); return; }
  };

  /** Refresca la lista ligera de nombres de cliente (selectores/autocompletados) tras crear uno nuevo. */
  const refrescarNombresClientes = () => {
    api.obtenerNombresClientes().then(setNombresClientes).catch(() => {});
  };

  const alCrearProyecto = async (proyecto: Proyecto) => {
    cargar();
    refrescarNombresClientes();
    setCreando(false);
    // Abrimos la ficha directamente con el proyecto recién creado; su
    // cliente (identidad) sí se pide al servidor porque el formulario no
    // lo devuelve completo.
    setSeleccionado(proyecto.id);
    setProyectoActual(proyecto);
    api.obtenerCliente(proyecto.clienteId).then(setClienteActualIdentidad).catch(() => setClienteActualIdentidad(null));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /**
   * Crea un proyecto (y su cliente, si es nuevo) SIN cambiar de sección ni
   * abrir su ficha — usado por "+ Nuevo cliente" dentro del selector de
   * "+ Crear presupuesto" (`PresupuestosListaGlobal`), para no obligar a
   * salir de ese flujo.
   */
  const alCrearProyectoRapido = (_proyecto: Proyecto) => {
    cargar();
    refrescarNombresClientes();
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
            {empresaCargando ? (
              // Mientras se confirma si hay un logo propio guardado, no
              // pintar ningún logo todavía — `empresa` arranca con el logo
              // de Madera Creativa por defecto (ver `use-empresa.ts`), y
              // pintarlo de inmediato para luego sustituirlo por el logo
              // real del negocio es justo el parpadeo reportado varias
              // veces (18/08/2026).
              <span className={styles.sidebarLogoImg} aria-hidden="true" />
            ) : empresa.logo ? (
              // Tamaño ajustable a mano (Ajustes de empresa) en vez del
              // máximo fijo de la clase CSS — el `max-width` inline siempre
              // gana sobre el de `.sidebarLogoImg` (mayor especificidad que
              // cualquier selector de clase), sin tener que tocar la clase.
              <img src={empresa.logo} alt={empresa.nombre || 'Logo empresa'} className={styles.sidebarLogoImg} style={{ maxWidth: `${empresa.logoTamano || 187}px` }} />
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
              data-tutorial-id="nav-inicio"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></svg>
              Inicio
            </button>
            <button
              className={`${styles.sidebarNavItem} ${seccion === 'clientes' ? styles.sidebarNavItemActivo : ''}`}
              onClick={() => { cambiarSeccion('clientes'); volverALista(); }}
              data-tutorial-id="nav-clientes"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
              Clientes
            </button>
            <button
              className={`${styles.sidebarNavItem} ${seccion === 'dibujos' ? styles.sidebarNavItemActivo : ''}`}
              onClick={() => { cambiarSeccion('dibujos'); volverALista(); }}
              data-tutorial-id="nav-dibujos"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" /></svg>
              Pizarra de medición
            </button>
            <button
              className={`${styles.sidebarNavItem} ${seccion === 'presupuestos' ? styles.sidebarNavItemActivo : ''}`}
              onClick={() => { cambiarSeccion('presupuestos'); volverALista(); }}
              data-tutorial-id="nav-presupuestos"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
              Presupuestos
            </button>
            {/* "Crear presupuesto" del sidebar retirado en el Incremento 1 del
                Motor Documental — vuelve en el Incremento 2 apuntando ya al
                editor nuevo (ver ARQUITECTURA-MOTOR-DOCUMENTAL.md). */}
            <button
              className={`${styles.sidebarNavItem} ${seccion === 'inteligenciaPrecios' ? styles.sidebarNavItemActivo : ''}`}
              onClick={() => cambiarSeccion('inteligenciaPrecios')}
              data-tutorial-id="nav-inteligencia-precios"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>
              Inteligencia de precios
            </button>
            <button
              className={`${styles.sidebarNavItem} ${seccion === 'facturas' ? styles.sidebarNavItemActivo : ''}`}
              onClick={() => cambiarSeccion('facturas')}
              data-tutorial-id="nav-facturas"
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
              data-tutorial-id="nav-proveedores"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /><line x1="12" y1="12" x2="12" y2="16" /><line x1="10" y1="14" x2="14" y2="14" /></svg>
              Proveedores
            </button>
            <button
              className={`${styles.sidebarNavItem} ${seccion === 'notas' ? styles.sidebarNavItemActivo : ''}`}
              onClick={() => { cambiarSeccion('notas'); volverALista(); }}
              data-tutorial-id="nav-notas"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
              Notas
            </button>
            <button
              className={`${styles.sidebarNavItem} ${seccion === 'calendario' ? styles.sidebarNavItemActivo : ''}`}
              onClick={() => { cambiarSeccion('calendario'); volverALista(); }}
              data-tutorial-id="nav-calendario"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
              Calendario
            </button>
            <button
              className={`${styles.sidebarNavItem} ${seccion === 'codigosQR' ? styles.sidebarNavItemActivo : ''}`}
              onClick={() => { cambiarSeccion('codigosQR'); volverALista(); }}
              data-tutorial-id="nav-codigos-qr"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="1" y="1" width="7" height="7" /><rect x="16" y="1" width="7" height="7" /><rect x="1" y="16" width="7" height="7" /><line x1="16" y1="16" x2="16" y2="23" /><line x1="23" y1="16" x2="23" y2="23" /><line x1="16" y1="19.5" x2="23" y2="19.5" /></svg>
              Código QR
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
              {estadoPush !== 'no-soportado' && (
                <button
                  className={styles.sidebarAccionBtn}
                  onClick={() => { setPanelNotificaciones(true); setMenuMovilAbierto(false); }}
                  title="Notificaciones"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
                </button>
              )}
              <button
                className={styles.sidebarAccionBtn}
                onClick={alternarTema}
                title={tema === 'oscuro' ? 'Modo claro' : 'Modo oscuro'}
              >
                {tema === 'oscuro'
                  ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>
                  : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>}
              </button>
              {/*
                Centro de ayuda (Fase E, 25/08/2026) — sustituye al
                disparador temporal de un solo tutorial (24/08/2026): ahora
                el botón abre un menú con "Repetir el tour completo" y la
                ayuda de cada sección con tutorial contextual propio
                (Facturas, Proveedores — ver `tutorial-definiciones.ts`,
                las únicas con un `data-tutorial-id` propio dentro, no solo
                el botón del menú). El botón de cierre a pantalla completa
                (`fondo` clicable) es el mismo patrón que ya usa el
                desplegable de proveedores en `escaner-factura.tsx`.
              */}
              <div style={{ position: 'relative' }}>
                <button
                  className={styles.sidebarAccionBtn}
                  onClick={() => setCentroAyudaAbierto((v) => !v)}
                  title="Centro de ayuda"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c3 3 9 3 12 0v-5" /></svg>
                </button>
                {centroAyudaAbierto && (
                  <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: Z_DESPLEGABLE - 1 }} onClick={() => setCentroAyudaAbierto(false)} />
                    <div style={{
                      position: 'absolute', top: 'calc(100% + 4px)', left: 0,
                      background: 'var(--fondo-panel)', border: '1px solid var(--borde)', borderRadius: 8,
                      boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: Z_DESPLEGABLE,
                      minWidth: 220, display: 'flex', flexDirection: 'column', padding: '0.35rem', gap: '0.1rem',
                    }}>
                      <p style={{ margin: '0.25rem 0.6rem 0.15rem', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--topo-muy-claro)' }}>Centro de ayuda</p>
                      {[
                        { texto: 'Repetir el tour completo', definicion: TUTORIAL_APP },
                        { texto: 'Ayuda de Facturas', definicion: TUTORIAL_FACTURAS },
                        { texto: 'Ayuda de Proveedores', definicion: TUTORIAL_PROVEEDORES },
                      ].map((item) => (
                        <button
                          key={item.definicion.id}
                          type="button"
                          onClick={() => { tutorial.abrir(item.definicion, false); setCentroAyudaAbierto(false); setMenuMovilAbierto(false); }}
                          style={{
                            width: '100%', textAlign: 'left', background: 'none', border: 'none',
                            padding: '0.5rem 0.6rem', cursor: 'pointer', fontSize: '0.85rem',
                            color: 'var(--negro)', borderRadius: 6, fontFamily: 'inherit',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--topo-tinte)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                        >
                          {item.texto}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <button
                className={`${styles.sidebarAccionBtn} ${asistente ? styles.sidebarAccionBtnActivo : ''}`}
                onClick={() => { setAsistente((v) => !v); setMenuMovilAbierto(false); }}
                title="Asistente IA"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><circle cx="9" cy="10" r="1" fill="currentColor" /><circle cx="12" cy="10" r="1" fill="currentColor" /><circle cx="15" cy="10" r="1" fill="currentColor" /></svg>
              </button>
              <button
                className={styles.sidebarAccionBtn}
                onClick={() => { setSoportePanel(true); setMenuMovilAbierto(false); }}
                title="Comentarios y sugerencias"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
              </button>
              <button className={styles.sidebarAccionBtn} onClick={logout} title="Cerrar sesión">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
              </button>
            </div>
          </div>
        </aside>

        <div className={styles.contenidoPrincipal}>
      {/*
        ===== BARRA ATRÁS MÓVIL — todas las secciones de primer nivel =====
        Auditoría 31/08/2026: faltaban 'clientes' e 'inteligenciaPrecios'
        (esta última incluso tenía ya su caso preparado en el título de
        abajo, pero nunca se mostraba). 'clientes' se excluye cuando hay
        una ficha abierta porque FichaCliente ya pone su propia barra
        ("← Clientes") — mostrar las dos a la vez sería redundante.
      */}
      {(['presupuestos', 'facturas', 'notas', 'calendario', 'proveedores', 'dibujos', 'codigosQR', 'clientes', 'inteligenciaPrecios'] as string[]).includes(seccion)
        && !(seccion === 'dibujos' && dibujoEditorAbierto)
        && !(seccion === 'clientes' && proyectoActual && clienteActualIdentidad) && (
        <div className={styles.barraVolver}>
          <button
            className={styles.barraVolverBtn}
            onClick={volverSeccionAnterior}
          >
            <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6" /></svg>
            {ETIQUETA_SECCION_CORTA[historialSecciones[historialSecciones.length - 1] ?? 'inicio']}
          </button>
          <p className={styles.barraVolverTitulo}>
            {seccion === 'presupuestos' ? 'Presupuestos' : seccion === 'inteligenciaPrecios' ? 'Inteligencia de precios' : seccion === 'facturas' ? 'Facturas' : seccion === 'notas' ? 'Notas' : seccion === 'calendario' ? 'Calendario' : seccion === 'dibujos' ? 'Pizarra de medición' : seccion === 'codigosQR' ? 'Código QR' : seccion === 'clientes' ? 'Clientes' : 'Proveedores'}
          </p>
          <div style={{ width: 56, flexShrink: 0 }} />
        </div>
      )}

      <main className={`${styles.main} ${styles.mainConBottomNav}`}>
        {/*
          ===== "VOLVER" EN ESCRITORIO =====
          La barra de arriba solo se ve en móvil (`.barraVolver`, oculta
          por CSS en escritorio). En una pantalla ancha el sidebar siempre
          está visible, así que hasta ahora "volver a la pestaña anterior"
          no existía ahí (el usuario probó esto en una tablet que renderiza
          el layout de escritorio — el sidebar completo, sin barra móvil —
          y pidió explícitamente poder volver a la pestaña anterior desde
          cualquier pestaña, 31/08/2026). Mismo `.volver` que ya usan
          FichaCliente y la ficha de Proveedor para su "volver" local.
        */}
        {(['presupuestos', 'facturas', 'notas', 'calendario', 'proveedores', 'dibujos', 'codigosQR', 'clientes', 'inteligenciaPrecios'] as string[]).includes(seccion)
          && !(seccion === 'dibujos' && dibujoEditorAbierto)
          && !(seccion === 'clientes' && proyectoActual && clienteActualIdentidad) && (
          <button className={styles.volver} onClick={volverSeccionAnterior}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: -2, marginRight: 4 }}><polyline points="15 18 9 12 15 6" /></svg>
            Volver a {ETIQUETA_SECCION_CORTA[historialSecciones[historialSecciones.length - 1] ?? 'inicio']}
          </button>
        )}
        {/* ── SECCIÓN INICIO ── */}
        {seccion === 'inicio' && (
          <Dashboard
            nombre={nombreParaMostrar}
            proyectos={proyectos}
            facturas={facturas}
            resumen={resumenFacturas}
            privado={privado}
            onAlternarPrivacidad={alternarPrivacidad}
            onAbrir={(id) => { cambiarSeccion('clientes'); abrirProyecto(id); }}
            onBorrarFactura={borrarFactura}
            onActualizarRecordatorio={actualizarRecordatorio}
          />
        )}

        {/* ── SECCIÓN NOTAS ── */}
        {seccion === 'notas' && <NotasVista clientes={nombresClientes} />}

        {/* ── SECCIÓN CALENDARIO (30/08/2026) ── */}
        {seccion === 'calendario' && <CalendarioVista proyectos={proyectos} onAbrirElemento={abrirElementoCalendario} />}

        {/* ── SECCIÓN CÓDIGOS QR ── */}
        {seccion === 'codigosQR' && <CodigosQRVista />}

        {/* ── SECCIÓN DIBUJOS (Fase 2.1) ── */}
        {seccion === 'dibujos' && <SeccionDibujos clientes={nombresClientes} onEditorAbierto={setDibujoEditorAbierto} />}

        {/* ── SECCIÓN PROVEEDORES ── */}
        {seccion === 'proveedores' && (
          <SeccionProveedores
            proveedores={proveedores}
            productos={productos}
            privado={privado}
            onCrearProveedor={crearProveedor}
            onActualizarProveedor={actualizarProveedor}
            onBorrarProveedor={borrarProveedor}
            onFusionarProveedores={fusionarProveedores}
            onCrearProducto={crearProducto}
            onActualizarProducto={actualizarProducto}
            onBorrarProducto={borrarProducto}
          />
        )}

        {/* ── SECCIÓN PRESUPUESTOS ── */}
        {seccion === 'presupuestos' && (
          <SeccionPresupuestosContenedor
            onAbrirCliente={(id) => { cambiarSeccion('clientes'); abrirProyecto(id); }}
            clientes={nombresClientes}
            empresa={empresa}
            onActualizarEmpresa={actualizar}
            onCrearProyecto={alCrearProyectoRapido}
          />
        )}

        {/* ── SECCIÓN INTELIGENCIA DE PRECIOS (Fase 1) ── */}
        {seccion === 'inteligenciaPrecios' && (
          <InteligenciaPreciosVista empresa={empresa} plan={sesion?.plan} />
        )}

        {/* ── SECCIÓN FACTURAS ── */}
        {seccion === 'facturas' && (
          <Facturas
            facturas={facturas}
            resumen={resumenFacturas}
            privado={privado}
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
            onActualizarProveedor={actualizarProveedor}
          />
        )}

        {/* ── SECCIÓN CLIENTES ── */}
        {seccion === 'clientes' && (
          <>
            {/* La ficha siempre tiene prioridad, independientemente del estado de carga */}
            {proyectoActual && clienteActualIdentidad ? (
              <FichaCliente
                cliente={clienteActualIdentidad}
                proyecto={proyectoActual}
                clientes={nombresClientes}
                empresa={empresa}
                privado={privado}
                onActualizarEmpresa={actualizar}
                onVolver={volverALista}
                onActualizarCliente={(c) => { setClienteActualIdentidad(c); api.guardarCliente(c); refrescarNombresClientes(); }}
                onActualizarProyecto={(p) => { setProyectoActual(p); return actualizarProyecto(p); }}
                onBorrar={(id) => { borrarProyecto(id); volverALista(); }}
                onGuardarFactura={(f: Factura) => guardarFactura(f)}
                proveedores={proveedores}
                onCrearProveedor={crearProveedor}
                onActualizarProveedor={actualizarProveedor}
              />
            ) : cargando && proyectos.length === 0 ? (
              <div className={styles.vacio}>
                <div className={styles.vacioIcono} style={{ display: 'flex', justifyContent: 'center' }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                </div>
                <p>Cargando tus clientes…</p>
              </div>
            ) : (
              <>
                {error && proyectos.length === 0 && (
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
                  clientes={proyectos}
                  onNuevo={() => setCreando(true)}
                  onAbrir={abrirProyecto}
                />
              </>
            )}
          </>
        )}
      </main>
        </div>
      </div>

      {creando && (
        <FormularioCliente onGuardar={alCrearProyecto} onCerrar={() => setCreando(false)} />
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

      {panelNotificaciones && (
        <PanelNotificaciones estadoPush={estadoPush} errorPush={errorPush} onActivarPush={activarPush} onCerrar={() => setPanelNotificaciones(false)} esAdmin={sesion?.esAdmin ?? false} />
      )}

      {soportePanel && <SoportePanel onCerrar={() => setSoportePanel(false)} />}

      {/* Sistema de tutoriales (Fase 1, 24/08/2026) — montado siempre,
          igual que <AsistenteIA> justo debajo: no depende de qué sección
          esté activa, y recibe la navegación real de la app (nunca crea
          un sistema paralelo). */}
      <TutorialOverlay
        estado={tutorial.estado}
        onAvanzar={tutorial.avanzar}
        onRetroceder={tutorial.retroceder}
        onCerrar={tutorial.cerrar}
        onObjetivoLocalizado={tutorial.objetivoLocalizado}
        onAccionDetectada={tutorial.accionDetectada}
        seccionActual={seccion}
        onNavegar={(s) => { cambiarSeccion(s as Seccion); volverALista(); }}
        menuMovilAbierto={menuMovilAbierto}
        onAbrirMenuMovil={() => setMenuMovilAbierto(true)}
        onCerrarMenuMovil={() => setMenuMovilAbierto(false)}
      />

      {/* Asistente IA — botón flotante siempre visible (además del icono del
          menú lateral, que en móvil queda oculto hasta abrir el menú) */}
      <AsistenteIA
        abiertoProp={asistente}
        onCambiarAbierto={setAsistente}
        contexto={{ seccionActual: seleccionado ? `ficha-cliente:${clienteActualIdentidad?.nombre || ''}` : seccion, clienteAbierto: proyectoActual?.id } as ContextoApp}
        clientes={nombresClientes}
        onNavegar={(s) => { cambiarSeccion(s as Seccion); volverALista(); }}
        onAbrirCliente={abrirProyecto}
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
