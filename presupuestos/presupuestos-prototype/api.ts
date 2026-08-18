import type { Cliente, Factura, Proveedor, Producto, Dibujo, Carpeta, GastoPeriodico, Movimiento, Tarea } from './types.js';
import type { NotaMC } from './notas-modelo.js';
import type { PresupuestoMC, PresupuestoPublico } from './presupuestos-modelo.js';
import type { PlantillaMC, RecursoMC, ComponenteMC } from './documento-modelo.js';
import type { ContratoMC } from './contratos-modelo.js';
import type { Empresa } from './use-empresa.js';
import type { Perfil } from './use-perfil.js';

// En local (Bit) el gateway solo entiende peticiones bajo `/api/presupuestos-service/...`,
// así que ese es el valor por defecto. En un despliegue combinado fuera de
// Bit (Render: frontend y backend en el mismo proceso/origen, sin gateway
// que reescriba nada) se compila con `VITE_API_BASE=""` para llamar a las
// rutas directamente (`/auth/login`, no `/api/presupuestos-service/auth/login`).
const BASE = (import.meta as any).env?.VITE_API_BASE ?? '/api/presupuestos-service';

/**
 * Punto único de gestión de autenticación del frontend: guarda el access
 * token en memoria (nunca en localStorage — así una fuga por XSS no puede
 * leerlo directamente del almacenamiento), renueva la sesión mediante el
 * refresh token (cookie httpOnly que el navegador gestiona solo) y expone
 * `fetchConAuth()` como única forma de llamar a un endpoint protegido.
 *
 * Ningún otro módulo debe leer/escribir tokens de autenticación por su
 * cuenta ni llamar a `fetch` directamente contra una ruta protegida.
 */

let accessToken: string | null = null;
let callbackSesionInvalida: (() => void) | null = null;
let refrescoEnCurso: Promise<boolean> | null = null;

/** Guarda (o borra, con `null`) el access token en memoria. */
export function establecerAccessToken(token: string | null): void {
  accessToken = token;
}

/** Devuelve el access token actual, o `null` si no hay sesión. */
export function obtenerAccessToken(): string | null {
  return accessToken;
}

/**
 * Registra la función a llamar cuando la sesión deja de poder renovarse
 * (refresh token caducado o revocado). `use-auth.ts` la usa para forzar
 * el cierre de sesión local.
 */
export function alPerderSesion(callback: () => void): void {
  callbackSesionInvalida = callback;
}

/**
 * Renueva la sesión llamando a `/auth/refresh` (usa la cookie httpOnly del
 * refresh token, que el navegador envía solo). Si dos llamadas se solapan
 * (varias peticiones en curso caducan a la vez), comparten la misma
 * renovación en lugar de disparar una por cada una.
 */
export async function refrescarSesion(): Promise<boolean> {
  if (refrescoEnCurso) return refrescoEnCurso;
  refrescoEnCurso = (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' });
      if (!res.ok) { establecerAccessToken(null); return false; }
      const data = await res.json() as { accessToken: string };
      establecerAccessToken(data.accessToken);
      return true;
    } catch {
      return false;
    }
  })();
  try {
    return await refrescoEnCurso;
  } finally {
    refrescoEnCurso = null;
  }
}

/** Cierra sesión en el servidor (revoca el refresh token) y borra el access token local. */
export async function cerrarSesionServidor(): Promise<void> {
  try {
    await fetch(`${BASE}/auth/logout`, { method: 'POST', credentials: 'include' });
  } catch { /* best-effort: si no hay red, la sesión local se cierra igual */ }
  establecerAccessToken(null);
}

/**
 * Única forma de llamar a un endpoint protegido. Adjunta el access token
 * y, si el servidor responde 401 (token caducado), intenta renovarlo una
 * vez y repite la petición original antes de rendirse.
 */
export async function fetchConAuth(path: string, opciones: RequestInit = {}): Promise<Response> {
  const conToken = (): RequestInit => ({
    ...opciones,
    credentials: 'include',
    headers: { ...opciones.headers, Authorization: `Bearer ${accessToken ?? ''}` },
  });

  let res = await fetch(`${BASE}${path}`, conToken());
  if (res.status !== 401) return res;

  const renovada = await refrescarSesion();
  if (!renovada) {
    callbackSesionInvalida?.();
    return res;
  }

  res = await fetch(`${BASE}${path}`, conToken());
  if (res.status === 401) callbackSesionInvalida?.();
  return res;
}

/** Lanza error con codigo HTTP si la respuesta no es ok. */
async function comprobarRespuesta(res: Response, mensaje: string): Promise<Response> {
  if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? String(res.status) : mensaje);
  return res;
}

/**
 * Igual que `comprobarRespuesta`, pero si el servidor responde 400/409 con
 * un mensaje de negocio concreto (`ErrorDeNegocio` — p. ej. "ya existe una
 * carpeta con ese nombre" o "la carpeta contiene N dibujos"), lo usa en
 * lugar del mensaje genérico, porque aquí sí merece la pena mostrárselo
 * al usuario tal cual.
 */
async function comprobarRespuestaConMotivo(res: Response, mensaje: string): Promise<Response> {
  if (res.ok) return res;
  if (res.status === 401 || res.status === 403) throw new Error(String(res.status));
  if (res.status === 400 || res.status === 409) {
    const cuerpo = await res.json().catch(() => null) as { error?: string } | null;
    if (cuerpo?.error) throw new Error(cuerpo.error);
  }
  throw new Error(mensaje);
}

/** Página de resultados de un listado paginado. */
export type Pagina<T> = {
  items: T[];
  pagina: number;
  limite: number;
  total: number;
  totalPaginas: number;
};

/* ===== FACTURAS ===== */

/**
 * Lista una página de facturas (sin imagen base64), opcionalmente filtrada
 * por tipo — el filtro se resuelve en el servidor, no en el cliente.
 */
export async function obtenerFacturas(pagina = 1, limite = 30, tipo: 'ingreso' | 'gasto' | 'todas' = 'todas'): Promise<Pagina<Factura>> {
  const res = await fetchConAuth(`/facturas?pagina=${pagina}&limite=${limite}&tipo=${tipo}`);
  await comprobarRespuesta(res, 'No se pudieron cargar las facturas');
  return res.json();
}

/**
 * Todas las facturas de un año concreto, sin paginar — para el resumen
 * trimestral, que necesita el año completo para ser correcto. Con
 * `trimestre` (1-4), acota además a ese trimestre — para navegar las
 * facturas "por carpetas" en la lista.
 */
export async function obtenerFacturasPorAnio(anio: number, trimestre?: number): Promise<Factura[]> {
  const qs = trimestre ? `anio=${anio}&trimestre=${trimestre}` : `anio=${anio}`;
  const res = await fetchConAuth(`/facturas?${qs}`);
  await comprobarRespuesta(res, 'No se pudieron cargar las facturas del año');
  const datos: Pagina<Factura> = await res.json();
  return datos.items;
}

/** Totales y recuentos de ingresos/gastos/balance, calculados en el servidor. */
export type ResumenFacturas = {
  totalIngresos: number; totalGastos: number; balance: number;
  numIngresos: number; numGastos: number; numFacturas: number;
};

export async function obtenerResumenFacturas(): Promise<ResumenFacturas> {
  const res = await fetchConAuth('/facturas/resumen');
  await comprobarRespuesta(res, 'No se pudo cargar el resumen de facturas');
  return res.json();
}

/** Años para los que existe alguna factura, más recientes primero. */
export async function obtenerAniosConFacturas(): Promise<number[]> {
  const res = await fetchConAuth('/facturas/anios');
  await comprobarRespuesta(res, 'No se pudieron cargar los años con facturas');
  return res.json();
}

/** Todas las facturas de un cliente concreto, sin paginar — para la ficha de cliente. */
export async function obtenerFacturasDeCliente(clienteId: string): Promise<Factura[]> {
  const res = await fetchConAuth(`/facturas?clienteId=${encodeURIComponent(clienteId)}`);
  await comprobarRespuesta(res, 'No se pudieron cargar las facturas del cliente');
  const datos: Pagina<Factura> = await res.json();
  return datos.items;
}

/** Todas las facturas de un proveedor concreto (búsqueda difusa por nombre), sin paginar. */
export async function obtenerFacturasDeProveedor(nombreProveedor: string): Promise<Factura[]> {
  const res = await fetchConAuth(`/facturas?proveedor=${encodeURIComponent(nombreProveedor)}`);
  await comprobarRespuesta(res, 'No se pudieron cargar las facturas del proveedor');
  const datos: Pagina<Factura> = await res.json();
  return datos.items;
}

/** Total gastado y número de facturas por proveedor (texto), calculado en el servidor. */
export async function obtenerResumenPorProveedor(): Promise<{ proveedor: string; proveedorId: string; totalGastado: number; numFacturas: number }[]> {
  const res = await fetchConAuth('/facturas/resumen-proveedores');
  await comprobarRespuesta(res, 'No se pudo cargar el resumen de proveedores');
  return res.json();
}

/**
 * Obtiene una factura completa con imagen.
 * @param id Identificador de la factura.
 */
export async function obtenerFactura(id: string): Promise<Factura> {
  const res = await fetchConAuth(`/facturas/${id}`);
  await comprobarRespuesta(res, 'No se pudo cargar la factura');
  return res.json();
}

/**
 * Guarda o actualiza una factura.
 * @param f La factura a guardar.
 */
export async function guardarFactura(f: Factura): Promise<Factura> {
  const res = await fetchConAuth(`/facturas/${f.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(f),
  });
  await comprobarRespuesta(res, 'No se pudo guardar la factura');
  return res.json();
}

/**
 * Borra una factura por su id.
 * @param id Identificador de la factura.
 */
export async function borrarFactura(id: string): Promise<void> {
  const res = await fetchConAuth(`/facturas/${id}`, { method: 'DELETE' });
  await comprobarRespuesta(res, 'No se pudo borrar la factura');
}

/** Nombre de archivo sugerido por el servidor, leído de `Content-Disposition`. */
function nombreDesdeContentDisposition(res: Response, porDefecto: string): string {
  const cabecera = res.headers.get('Content-Disposition') ?? '';
  const m = cabecera.match(/filename="?([^"]+)"?/);
  return m?.[1] ?? porDefecto;
}

/** Descarga el archivo (PDF/ZIP) que devuelve `res` en el navegador, con el nombre indicado por el servidor. */
function descargarBlobDelNavegador(blob: Blob, nombreArchivo: string): void {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}

/** Descarga el PDF real de una factura (Fase Facturas Profesional). */
export async function descargarPdfFactura(id: string): Promise<void> {
  const res = await fetchConAuth(`/facturas/${id}/pdf`);
  await comprobarRespuesta(res, 'No se pudo generar el PDF de la factura');
  descargarBlobDelNavegador(await res.blob(), nombreDesdeContentDisposition(res, `factura-${id}.pdf`));
}

/**
 * Descarga un ZIP con el PDF de varias facturas — por `ids` concretos
 * (selección múltiple) o por filtro `anio`/`trimestre`/`tipo` ("Descargar
 * todas").
 */
export async function descargarZipFacturas(opciones: { ids?: string[]; anio?: number; trimestre?: number; tipo?: 'ingreso' | 'gasto' }): Promise<void> {
  const res = await fetchConAuth('/facturas/descargar-zip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opciones),
  });
  await comprobarRespuesta(res, 'No se pudo generar el paquete de facturas');
  descargarBlobDelNavegador(await res.blob(), nombreDesdeContentDisposition(res, 'facturas.zip'));
}

/** Descarga la documentación completa para el asesor de un trimestre (resumen PDF + facturas en ZIP). */
export async function descargarDocumentacionAsesor(anio: number, trimestre: number): Promise<void> {
  const res = await fetchConAuth(`/facturas/documentacion-asesor?anio=${anio}&trimestre=${trimestre}`);
  await comprobarRespuesta(res, 'No se pudo generar la documentación para el asesor');
  descargarBlobDelNavegador(await res.blob(), nombreDesdeContentDisposition(res, `documentacion-T${trimestre}-${anio}.zip`));
}

/* ===== GASTOS PERIÓDICOS/ESTIMADOS (Fase Facturas Profesional) ===== */

export async function obtenerGastosPeriodicos(): Promise<GastoPeriodico[]> {
  const res = await fetchConAuth('/gastos-periodicos');
  await comprobarRespuesta(res, 'No se pudieron cargar los gastos periódicos');
  return res.json();
}

export async function guardarGastoPeriodico(g: GastoPeriodico): Promise<GastoPeriodico> {
  const res = await fetchConAuth(`/gastos-periodicos/${g.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(g),
  });
  await comprobarRespuesta(res, 'No se pudo guardar el gasto periódico');
  return res.json();
}

export async function borrarGastoPeriodico(id: string): Promise<void> {
  const res = await fetchConAuth(`/gastos-periodicos/${id}`, { method: 'DELETE' });
  await comprobarRespuesta(res, 'No se pudo borrar el gasto periódico');
}

/* ===== DIBUJOS (módulo profesional de dibujo, Fase 2.1) ===== */

/**
 * Lista los dibujos del usuario, sin el contenido vectorial (versión ligera
 * para la galería y el apartado "Dibujos" de la ficha). `clienteId`/`carpetaId`
 * distinguen "sin filtro" (omitido) de "filtrar por vacío" (cadena vacía) —
 * así se puede pedir solo la bandeja de temporales (`temporales: true`) o
 * solo los dibujos sueltos de un cliente (`carpetaId: ''`).
 */
export async function listarDibujos(opciones?: { clienteId?: string; carpetaId?: string; temporales?: boolean }): Promise<Dibujo[]> {
  const params = new URLSearchParams();
  if (opciones?.temporales) params.set('temporales', '1');
  else if (opciones?.clienteId !== undefined) params.set('clienteId', opciones.clienteId);
  if (opciones?.carpetaId !== undefined) params.set('carpetaId', opciones.carpetaId);
  const query = params.toString() ? `?${params.toString()}` : '';
  const res = await fetchConAuth(`/dibujos${query}`);
  await comprobarRespuesta(res, 'No se pudieron cargar los dibujos');
  return res.json();
}

/**
 * Obtiene un dibujo completo, incluyendo su contenido vectorial — solo al
 * abrirlo para editar, nunca para listar.
 * @param id Identificador del dibujo.
 */
export async function obtenerDibujo(id: string): Promise<Dibujo> {
  const res = await fetchConAuth(`/dibujos/${id}`);
  await comprobarRespuesta(res, 'No se pudo cargar el dibujo');
  return res.json();
}

/**
 * Guarda o actualiza un dibujo.
 * @param d El dibujo a guardar.
 */
export async function guardarDibujo(d: Dibujo): Promise<Dibujo> {
  const res = await fetchConAuth(`/dibujos/${d.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(d),
  });
  await comprobarRespuesta(res, 'No se pudo guardar el dibujo');
  return res.json();
}

/**
 * Borra un dibujo por su id.
 * @param id Identificador del dibujo.
 */
export async function borrarDibujo(id: string): Promise<void> {
  const res = await fetchConAuth(`/dibujos/${id}`, { method: 'DELETE' });
  await comprobarRespuesta(res, 'No se pudo borrar el dibujo');
}

/**
 * Duplica un dibujo — la copia se crea en el servidor (mismo cliente y
 * carpeta que el original) y se devuelve ya lista.
 * @param id Dibujo a duplicar.
 */
export async function duplicarDibujo(id: string): Promise<Dibujo> {
  const res = await fetchConAuth(`/dibujos/${id}/duplicar`, { method: 'POST' });
  await comprobarRespuesta(res, 'No se pudo duplicar el dibujo');
  return res.json();
}

/* ===== CARPETAS DE DIBUJOS (Fase 2.2) ===== */

/**
 * Lista las carpetas de dibujos de un cliente.
 * @param clienteId Ficha de cliente.
 */
export async function listarCarpetas(clienteId: string): Promise<Carpeta[]> {
  const res = await fetchConAuth(`/carpetas?clienteId=${encodeURIComponent(clienteId)}`);
  await comprobarRespuesta(res, 'No se pudieron cargar las carpetas');
  return res.json();
}

/**
 * Crea una carpeta de dibujos dentro de un cliente.
 * @param carpeta Carpeta a crear (id, clienteId, nombre).
 */
export async function crearCarpeta(carpeta: { id: string; clienteId: string; nombre: string }): Promise<Carpeta> {
  const res = await fetchConAuth('/carpetas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(carpeta),
  });
  await comprobarRespuestaConMotivo(res, 'No se pudo crear la carpeta');
  return res.json();
}

/**
 * Renombra una carpeta.
 * @param id Carpeta a renombrar.
 * @param nombre Nuevo nombre.
 */
export async function renombrarCarpeta(id: string, nombre: string): Promise<Carpeta> {
  const res = await fetchConAuth(`/carpetas/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre }),
  });
  await comprobarRespuestaConMotivo(res, 'No se pudo renombrar la carpeta');
  return res.json();
}

/**
 * Borra una carpeta — falla con un mensaje claro si todavía contiene dibujos.
 * @param id Carpeta a borrar.
 */
export async function borrarCarpeta(id: string): Promise<void> {
  const res = await fetchConAuth(`/carpetas/${id}`, { method: 'DELETE' });
  await comprobarRespuestaConMotivo(res, 'No se pudo borrar la carpeta');
}

/* ===== CLIENTES ===== */

/**
 * Recupera una ficha completa de cliente por su id (incluye adjuntos).
 * @param id Identificador del cliente.
 * @returns El cliente completo.
 */
export async function obtenerCliente(id: string): Promise<Cliente> {
  const res = await fetchConAuth(`/clientes/${id}`);
  await comprobarRespuesta(res, 'No se pudo cargar el cliente');
  return res.json();
}

/**
 * Recupera solo los adjuntos de un cliente — aparte de `obtenerCliente`,
 * que ya no los incluye (algunos clientes reales tienen adjuntos
 * históricos de varios MB; pedirlos aparte evita que abrir la ficha
 * tarde tanto que el proxy de desarrollo corte la conexión).
 * @param id Identificador del cliente.
 */
export async function obtenerAdjuntosCliente(id: string): Promise<Cliente['adjuntos']> {
  const res = await fetchConAuth(`/clientes/${id}/adjuntos`);
  await comprobarRespuesta(res, 'No se pudieron cargar los adjuntos');
  return res.json();
}

/**
 * Recupera una página de fichas de cliente desde el servidor.
 * @returns Página de clientes.
 */
export async function obtenerClientes(pagina = 1, limite = 30): Promise<Pagina<Cliente>> {
  const res = await fetchConAuth(`/clientes?pagina=${pagina}&limite=${limite}`);
  await comprobarRespuesta(res, 'No se pudieron cargar los clientes'); // incluye código HTTP para detectar 401
  return res.json();
}

/**
 * Recupera solo `id`+`nombre` de todos los clientes, sin paginar — para
 * selectores (p. ej. el desplegable de cliente al crear una factura).
 */
export async function obtenerNombresClientes(): Promise<{ id: string; nombre: string }[]> {
  const res = await fetchConAuth('/clientes/nombres');
  await comprobarRespuesta(res, 'No se pudieron cargar los nombres de clientes');
  return res.json();
}

/** Cliente sin sus campos pesados (fotos/adjuntos/dibujos/movimientos), para vistas que necesitan el conjunto completo. */
export type ClienteResumen = { id: string; nombre: string; proyecto: string; estado: string; presupuesto: number; creado: string };

/**
 * Recupera un resumen ligero de todos los clientes, sin paginar — para
 * `SeccionPresupuestos`, que organiza el conjunto completo por año y carpeta.
 */
export async function obtenerResumenClientes(): Promise<ClienteResumen[]> {
  const res = await fetchConAuth('/clientes/resumen');
  await comprobarRespuesta(res, 'No se pudieron cargar los presupuestos');
  return res.json();
}

/**
 * Crea o actualiza una ficha de cliente en el servidor.
 * @param cliente La ficha del cliente a guardar.
 * @returns El cliente guardado.
 */
export async function guardarCliente(cliente: Cliente): Promise<Cliente> {
  const res = await fetchConAuth(`/clientes/${cliente.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cliente),
  });
  await comprobarRespuesta(res, 'No se pudo guardar el cliente');
  return res.json();
}

/**
 * Rutas quirúrgicas dedicadas (Hardening Fase 2) — `guardarCliente` ya no
 * acepta cambios en movimientos/tareas/estado/presupuesto tras la
 * creación; estas son ahora la única forma de cambiarlos.
 */
export async function anadirMovimientoCliente(clienteId: string, m: Omit<Movimiento, 'id' | 'facturaId'>): Promise<Cliente> {
  const res = await fetchConAuth(`/clientes/${clienteId}/movimientos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(m),
  });
  await comprobarRespuesta(res, 'No se pudo añadir el movimiento');
  return res.json();
}

export async function editarMovimientoCliente(clienteId: string, movimientoId: string, m: Omit<Movimiento, 'id' | 'facturaId'>): Promise<Cliente> {
  const res = await fetchConAuth(`/clientes/${clienteId}/movimientos/${movimientoId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(m),
  });
  await comprobarRespuesta(res, 'No se pudo editar el movimiento');
  return res.json();
}

export async function borrarMovimientoCliente(clienteId: string, movimientoId: string): Promise<Cliente> {
  const res = await fetchConAuth(`/clientes/${clienteId}/movimientos/${movimientoId}`, { method: 'DELETE' });
  await comprobarRespuesta(res, 'No se pudo borrar el movimiento');
  return res.json();
}

export async function guardarTareasCliente(clienteId: string, tareas: Tarea[]): Promise<Cliente> {
  const res = await fetchConAuth(`/clientes/${clienteId}/tareas`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tareas }),
  });
  await comprobarRespuesta(res, 'No se pudieron guardar las tareas');
  return res.json();
}

export async function cambiarEstadoCliente(clienteId: string, estado: Cliente['estado']): Promise<Cliente> {
  const res = await fetchConAuth(`/clientes/${clienteId}/estado`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ estado }),
  });
  await comprobarRespuesta(res, 'No se pudo cambiar el estado');
  return res.json();
}

export async function cambiarPresupuestoCliente(clienteId: string, presupuesto: number): Promise<Cliente> {
  const res = await fetchConAuth(`/clientes/${clienteId}/presupuesto`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ presupuesto }),
  });
  await comprobarRespuesta(res, 'No se pudo cambiar el presupuesto');
  return res.json();
}

/**
 * Borra una ficha de cliente del servidor.
 * @param id Identificador del cliente.
 */
export async function borrarCliente(id: string): Promise<void> {
  const res = await fetchConAuth(`/clientes/${id}`, { method: 'DELETE' });
  await comprobarRespuesta(res, 'No se pudo borrar el cliente');
}

/* ===== PROVEEDORES ===== */

/** Recupera todos los proveedores del usuario. */
export async function obtenerProveedores(): Promise<Proveedor[]> {
  const res = await fetchConAuth('/proveedores');
  await comprobarRespuesta(res, 'No se pudieron cargar los proveedores');
  return res.json();
}

/** Crea o actualiza un proveedor. */
export async function guardarProveedor(proveedor: Proveedor): Promise<Proveedor> {
  const res = await fetchConAuth(`/proveedores/${proveedor.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(proveedor),
  });
  await comprobarRespuesta(res, 'No se pudo guardar el proveedor');
  return res.json();
}

/** Borra un proveedor por su id. */
export async function borrarProveedor(id: string): Promise<void> {
  const res = await fetchConAuth(`/proveedores/${id}`, { method: 'DELETE' });
  await comprobarRespuesta(res, 'No se pudo borrar el proveedor');
}

/* ===== NOTAS ===== */

/** Recupera todas las notas del usuario (sin filtrar — el filtrado es en el cliente). */
export async function obtenerNotas(): Promise<NotaMC[]> {
  const res = await fetchConAuth('/notas');
  await comprobarRespuesta(res, 'No se pudieron cargar las notas');
  return res.json();
}

/** Crea o actualiza una nota. */
export async function guardarNota(nota: NotaMC): Promise<NotaMC> {
  const res = await fetchConAuth(`/notas/${nota.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(nota),
  });
  await comprobarRespuesta(res, 'No se pudo guardar la nota');
  return res.json();
}

/** Borra una nota por su id. */
export async function borrarNota(id: string): Promise<void> {
  const res = await fetchConAuth(`/notas/${id}`, { method: 'DELETE' });
  await comprobarRespuesta(res, 'No se pudo borrar la nota');
}

/* ===== NÚCLEO DE IA (Fase 3/4/5) ===== */

/** Una acción de navegación pura que la app debe ejecutar (herramienta de permiso `'interfaz'`). */
export type AccionInterfazIA = { nombre: string; argumentos: Record<string, unknown> };

/** Una escritura propuesta por la IA, pendiente de confirmación explícita del usuario — nunca se ejecuta sola. */
export type PropuestaEscrituraIA = { id: string; nombre: string; argumentos: Record<string, unknown> };

export type RespuestaGenerarIA = {
  respuesta: string;
  accionesInterfaz: AccionInterfazIA[];
  propuestas: PropuestaEscrituraIA[];
};

type MensajeChatIA = { role: 'user' | 'assistant' | 'system'; content: string; imagenes?: string[] };
type EstadoTrabajoIA = 'pendiente' | 'completado' | 'error';
type RespuestaTrabajoIA<T> = { estado: EstadoTrabajoIA; resultado?: T; error?: string };

/**
 * Sondea un trabajo asíncrono de IA hasta que termina (Fase 5). El proxy de
 * desarrollo corta cualquier petición de más de ~3s — muy por debajo de lo
 * que puede tardar una respuesta real de Ollama en hardware sin GPU (hasta
 * ~90s medido) — por eso ninguna llamada de IA es una única petición
 * bloqueante: el backend responde al instante con un `trabajoId` y este
 * helper pregunta por su estado cada poco hasta que termina.
 */
async function sondearTrabajoIA<T>(trabajoId: string): Promise<T> {
  const INTERVALO_MS = 1200;
  const MAX_INTENTOS = 150; // ~3 minutos de margen
  for (let intento = 0; intento < MAX_INTENTOS; intento++) {
    const res = await fetchConAuth(`/ia/generar/${trabajoId}`);
    await comprobarRespuesta(res, 'No se pudo consultar el estado de la IA');
    const datos: RespuestaTrabajoIA<T> = await res.json();
    if (datos.estado === 'completado') return datos.resultado as T;
    if (datos.estado === 'error') throw new Error(datos.error || 'La IA no pudo completar la petición.');
    await new Promise((r) => setTimeout(r, INTERVALO_MS));
  }
  throw new Error('La IA está tardando demasiado. Inténtalo de nuevo en un momento.');
}

/**
 * Único punto de entrada al núcleo de IA — sustituye al antiguo `/asistente`.
 * `capacidad` selecciona qué capacidad de IA responde (hoy solo existe
 * `'asistente-global'`); `referencias` son solo identificadores/estado de
 * pantalla, nunca datos completos (el servidor decide qué consultar con ellos).
 * El sondeo ocurre dentro de esta función — el contrato externo (una
 * promesa que resuelve con la respuesta) no cambia para quien la llama.
 */
export async function generarRespuestaIA(params: {
  capacidad: string;
  mensajes: MensajeChatIA[];
  referencias?: Record<string, unknown>;
}): Promise<RespuestaGenerarIA> {
  const res = await fetchConAuth('/ia/generar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  await comprobarRespuesta(res, 'No se pudo generar la respuesta de IA');
  const { trabajoId } = await res.json();
  return sondearTrabajoIA<RespuestaGenerarIA>(trabajoId);
}

/**
 * Confirma una propuesta de escritura pendiente (Fase 5) — el backend
 * ejecuta la acción real (Mongo) y devuelve su resultado real de
 * inmediato; si se pasa `mensajesPrevios`, además pide a la IA una segunda
 * vuelta (sondeada igual que `generarRespuestaIA`) para redactar la
 * respuesta final usando ese resultado real.
 */
export async function confirmarPropuestaIA(params: {
  capacidad: string;
  nombre: string;
  argumentos: Record<string, unknown>;
  mensajesPrevios?: MensajeChatIA[];
  referencias?: Record<string, unknown>;
  /** Id de la llamada a herramienta que propuso el modelo — imprescindible para que el servidor pueda reconstruir una conversación válida al redactar la respuesta final. */
  toolCallId?: string;
}): Promise<{ resultado: Record<string, unknown>; respuestaFinal?: RespuestaGenerarIA }> {
  const res = await fetchConAuth('/ia/herramientas/ejecutar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  // "con motivo": un 400 de validación (p. ej. faltan datos imprescindibles)
  // trae un mensaje concreto del servidor — mostrarlo tal cual es mucho más
  // útil que el genérico "no se pudo confirmar", que no da ninguna pista de
  // qué ha fallado de verdad.
  await comprobarRespuestaConMotivo(res, 'No se pudo confirmar la acción');
  const data = await res.json();
  if (data.resultado?.error) throw new Error(data.resultado.error);
  if (!data.trabajoId) return { resultado: data.resultado };
  const respuestaFinal = await sondearTrabajoIA<RespuestaGenerarIA>(data.trabajoId);
  return { resultado: data.resultado, respuestaFinal };
}

/* ===== PRESUPUESTOS (Fase 5 — copiloto de Presupuestos) ===== */

/**
 * Presupuestos narrativos de un cliente — se pueden crear a mano desde
 * esta pestaña o pidiéndoselo al asistente de IA (herramientas
 * `crearPresupuesto`/`anadirElementoPresupuesto`, confirmadas por el
 * usuario) — ambos caminos escriben en la misma colección.
 */
export async function obtenerPresupuestos(clienteId: string): Promise<PresupuestoMC[]> {
  const res = await fetchConAuth(`/presupuestos?clienteId=${encodeURIComponent(clienteId)}`);
  await comprobarRespuesta(res, 'No se pudieron cargar los presupuestos');
  return res.json();
}

/** Lista todos los presupuestos del usuario, de cualquier cliente (Fase 6 — sección global "Documentos"). */
export async function obtenerTodosLosPresupuestos(): Promise<PresupuestoMC[]> {
  const res = await fetchConAuth('/presupuestos');
  await comprobarRespuesta(res, 'No se pudieron cargar los presupuestos');
  return res.json();
}

/** Crea o actualiza un presupuesto. */
export async function guardarPresupuesto(p: PresupuestoMC): Promise<PresupuestoMC> {
  const res = await fetchConAuth(`/presupuestos/${p.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(p),
  });
  await comprobarRespuesta(res, 'No se pudo guardar el presupuesto');
  return res.json();
}

/** Borra un presupuesto por su id. */
export async function borrarPresupuesto(id: string): Promise<void> {
  const res = await fetchConAuth(`/presupuestos/${id}`, { method: 'DELETE' });
  await comprobarRespuesta(res, 'No se pudo borrar el presupuesto');
}

/**
 * Marca un presupuesto como aceptado (Fase 1 — automatización "presupuesto
 * aceptado"): pone en marcha el proyecto (estado del cliente, checklist de
 * tareas, cobro pendiente, notificación) en el servidor. Idempotente — si
 * ya estaba aceptado, no falla ni repite nada, `yaEstabaAceptado` lo indica.
 */
export async function aceptarPresupuesto(id: string): Promise<{ presupuesto: PresupuestoMC; yaEstabaAceptado: boolean }> {
  const res = await fetchConAuth(`/presupuestos/${id}/aceptar`, { method: 'POST' });
  await comprobarRespuesta(res, 'No se pudo aceptar el presupuesto');
  const data = await res.json();
  return { presupuesto: data.presupuesto, yaEstabaAceptado: data.yaEstabaAceptado };
}

/** Genera (o regenera, revocando el anterior) el enlace público del Portal del cliente para este presupuesto. */
export async function generarEnlacePresupuesto(id: string): Promise<{ token: string; expiraEn: string }> {
  const res = await fetchConAuth(`/presupuestos/${id}/enlace`, { method: 'POST' });
  await comprobarRespuestaConMotivo(res, 'No se pudo generar el enlace');
  return res.json();
}

/**
 * Vista pública de un presupuesto (Portal del cliente) — sin sesión, por
 * eso usa `fetch` directo en vez de `fetchConAuth` (que exige un access
 * token en memoria, algo que el navegador del cliente final nunca tiene).
 */
export async function obtenerPresupuestoPublico(token: string): Promise<PresupuestoPublico> {
  const res = await fetch(`${BASE}/portal/presupuestos/${token}`);
  await comprobarRespuestaConMotivo(res, 'No se pudo cargar el presupuesto');
  return res.json();
}

/** Acepta (firma) un presupuesto desde el Portal del cliente — sin sesión. */
export async function aceptarPresupuestoPublico(token: string, firma: string): Promise<{ ok: true; yaEstabaAceptado: boolean }> {
  const res = await fetch(`${BASE}/portal/presupuestos/${token}/aceptar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ firma }),
  });
  await comprobarRespuestaConMotivo(res, 'No se pudo aceptar el presupuesto');
  return res.json();
}

/* ===== PLANTILLAS (Motor Documental, Incremento 4) ===== */

/** Recupera todas las plantillas del usuario. */
export async function obtenerPlantillas(): Promise<PlantillaMC[]> {
  const res = await fetchConAuth('/plantillas');
  await comprobarRespuesta(res, 'No se pudieron cargar las plantillas');
  return res.json();
}

/** Crea o actualiza una plantilla. */
export async function guardarPlantilla(p: PlantillaMC): Promise<PlantillaMC> {
  const res = await fetchConAuth(`/plantillas/${p.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(p),
  });
  await comprobarRespuesta(res, 'No se pudo guardar la plantilla');
  return res.json();
}

/** Borra una plantilla. */
export async function borrarPlantilla(id: string): Promise<void> {
  const res = await fetchConAuth(`/plantillas/${id}`, { method: 'DELETE' });
  await comprobarRespuesta(res, 'No se pudo borrar la plantilla');
}

/* ===== BIBLIOTECA DE RECURSOS (Motor Documental, Incremento 5) ===== */

/** Recupera todos los recursos de la biblioteca del usuario. */
export async function obtenerRecursos(): Promise<RecursoMC[]> {
  const res = await fetchConAuth('/recursos');
  await comprobarRespuesta(res, 'No se pudieron cargar los recursos');
  return res.json();
}

/** Sube un recurso nuevo (o recupera el existente si el mismo archivo ya estaba catalogado). */
export async function subirRecurso(datos: { nombre: string; tipo: RecursoMC['tipo']; ambito: RecursoMC['ambito']; etiquetas: string[]; dataUrl: string }): Promise<RecursoMC> {
  const res = await fetchConAuth('/recursos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datos),
  });
  await comprobarRespuesta(res, 'No se pudo subir el recurso');
  return res.json();
}

/** Renombra o retagea un recurso. */
export async function actualizarRecurso(id: string, cambios: { nombre?: string; etiquetas?: string[] }): Promise<RecursoMC> {
  const res = await fetchConAuth(`/recursos/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cambios),
  });
  await comprobarRespuesta(res, 'No se pudo actualizar el recurso');
  return res.json();
}

/** Borra un recurso de la biblioteca. */
export async function borrarRecurso(id: string): Promise<void> {
  const res = await fetchConAuth(`/recursos/${id}`, { method: 'DELETE' });
  await comprobarRespuesta(res, 'No se pudo borrar el recurso');
}

/* ===== COMPONENTES REUTILIZABLES (Motor Documental, Incremento 6) ===== */

/** Recupera todos los componentes del usuario. */
export async function obtenerComponentes(): Promise<ComponenteMC[]> {
  const res = await fetchConAuth('/componentes');
  await comprobarRespuesta(res, 'No se pudieron cargar los componentes');
  return res.json();
}

/** Crea o actualiza un componente. */
export async function guardarComponente(c: ComponenteMC): Promise<ComponenteMC> {
  const res = await fetchConAuth(`/componentes/${c.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(c),
  });
  await comprobarRespuesta(res, 'No se pudo guardar el componente');
  return res.json();
}

/** Borra un componente. */
export async function borrarComponente(id: string): Promise<void> {
  const res = await fetchConAuth(`/componentes/${id}`, { method: 'DELETE' });
  await comprobarRespuesta(res, 'No se pudo borrar el componente');
}

/* ===== CONTRATOS (Motor Documental, Incremento 12 — segundo tipo de documento) ===== */

/** Recupera los contratos de un cliente. */
export async function obtenerContratos(clienteId: string): Promise<ContratoMC[]> {
  const res = await fetchConAuth(`/contratos?clienteId=${encodeURIComponent(clienteId)}`);
  await comprobarRespuesta(res, 'No se pudieron cargar los contratos');
  return res.json();
}

/** Crea o actualiza un contrato. */
export async function guardarContrato(c: ContratoMC): Promise<ContratoMC> {
  const res = await fetchConAuth(`/contratos/${c.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(c),
  });
  await comprobarRespuesta(res, 'No se pudo guardar el contrato');
  return res.json();
}

/** Borra un contrato por su id. */
export async function borrarContrato(id: string): Promise<void> {
  const res = await fetchConAuth(`/contratos/${id}`, { method: 'DELETE' });
  await comprobarRespuesta(res, 'No se pudo borrar el contrato');
}

/* ===== PRODUCTOS / CATÁLOGO ===== */

/** Recupera todos los productos del catálogo del usuario. */
export async function obtenerProductos(): Promise<Producto[]> {
  const res = await fetchConAuth('/productos');
  await comprobarRespuesta(res, 'No se pudieron cargar los productos');
  return res.json();
}

/** Crea o actualiza un producto del catálogo. */
export async function guardarProducto(producto: Producto): Promise<Producto> {
  const res = await fetchConAuth(`/productos/${producto.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(producto),
  });
  await comprobarRespuesta(res, 'No se pudo guardar el producto');
  return res.json();
}

/** Borra un producto del catálogo por su id. */
export async function borrarProducto(id: string): Promise<void> {
  const res = await fetchConAuth(`/productos/${id}`, { method: 'DELETE' });
  await comprobarRespuesta(res, 'No se pudo borrar el producto');
}

/**
 * Recupera la configuración de empresa desde el servidor.
 * @returns Datos de la empresa.
 */
export async function obtenerEmpresa(): Promise<Empresa> {
  const res = await fetchConAuth('/empresa');
  await comprobarRespuesta(res, 'No se pudo cargar la empresa');
  const data = await res.json();
  return {
    nombre: data.nombre,
    eslogan: data.eslogan,
    logo: data.logo || null,
    nifCif: data.nifCif || '',
    telefono: data.telefono || '',
    email: data.email || '',
    iban: data.iban || '',
    condicionesPagoDefecto: data.condicionesPagoDefecto || '',
    validezDiasDefecto: data.validezDiasDefecto ?? 30,
    temaPorDefecto: data.temaPorDefecto ?? null,
    regionFiscal: data.regionFiscal || '',
    repepActivo: !!data.repepActivo,
    logoTamano: data.logoTamano || 187,
  };
}

/**
 * Guarda la configuración de empresa en el servidor.
 * @param empresa Cambios a guardar.
 * @returns Datos de la empresa guardados.
 */
export async function guardarEmpresa(empresa: Partial<Empresa>): Promise<Empresa> {
  const res = await fetchConAuth('/empresa', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...empresa, logo: empresa.logo ?? '' }),
  });
  await comprobarRespuesta(res, 'No se pudo guardar la empresa');
  const data = await res.json();
  return {
    nombre: data.nombre,
    eslogan: data.eslogan,
    logo: data.logo || null,
    nifCif: data.nifCif || '',
    telefono: data.telefono || '',
    email: data.email || '',
    iban: data.iban || '',
    condicionesPagoDefecto: data.condicionesPagoDefecto || '',
    validezDiasDefecto: data.validezDiasDefecto ?? 30,
    temaPorDefecto: data.temaPorDefecto ?? null,
    regionFiscal: data.regionFiscal || '',
    repepActivo: !!data.repepActivo,
    logoTamano: data.logoTamano || 187,
  };
}

/* ===== MI PERFIL ===== */

/** Recupera "Mi perfil" (nombre para mostrar y foto) del usuario autenticado. */
export async function obtenerPerfil(): Promise<Perfil> {
  const res = await fetchConAuth('/perfil');
  await comprobarRespuesta(res, 'No se pudo cargar el perfil');
  const data = await res.json();
  return { nombreMostrar: data.nombreMostrar || '', foto: data.foto || '' };
}

/** Guarda "Mi perfil" (nombre para mostrar y foto) del usuario autenticado. */
export async function guardarPerfil(perfil: Partial<Perfil>): Promise<void> {
  const res = await fetchConAuth('/perfil', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombreMostrar: perfil.nombreMostrar ?? '', foto: perfil.foto ?? '' }),
  });
  await comprobarRespuesta(res, 'No se pudo guardar el perfil');
}

/** Resultado de cambiar el usuario/contraseña de acceso. */
export type ResultadoCambioAcceso =
  | { ok: true; id: string; nombre: string; esAdmin: boolean; estado: string; accessToken: string }
  | { ok: false; error: string };

/**
 * Cambia el usuario de acceso y/o la contraseña. Exige siempre la
 * contraseña actual — se verifica en el servidor, nunca en el cliente. Si
 * tiene éxito, el servidor revoca el resto de sesiones y devuelve un
 * access token nuevo (se guarda aquí mismo, igual que en `loginEnServidor`).
 */
export async function cambiarAcceso(datos: { passwordActual: string; nombreNuevo?: string; passwordNueva?: string }): Promise<ResultadoCambioAcceso> {
  try {
    const res = await fetchConAuth('/perfil/acceso', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos),
    });
    const data = await res.json() as any;
    if (!res.ok) return { ok: false, error: data.error || data.detalles?.[0]?.mensaje || 'No se pudo cambiar el acceso.' };
    establecerAccessToken(data.accessToken);
    return { ok: true, id: data.id, nombre: data.nombre, esAdmin: !!data.esAdmin, estado: data.estado, accessToken: data.accessToken };
  } catch {
    return { ok: false, error: 'Sin conexión con el servidor.' };
  }
}

// ── Notificaciones — interruptores por tipo y recordatorios propios (18/08/2026) ──

/** Interruptores por tipo de notificación. */
export type NotifPrefs = {
  horas: boolean;
  cobrosPendientes: boolean;
  margenBajo: boolean;
  briefingDiario: boolean;
};

/** Recordatorio propio del usuario. */
export type RecordatorioPersonalizado = {
  id: string;
  texto: string;
  /** Hora del día, 0-23 (hora UTC). */
  hora: number;
  activo: boolean;
};

export async function obtenerPreferenciasNotificaciones(): Promise<{ preferencias: NotifPrefs; recordatorios: RecordatorioPersonalizado[] }> {
  const res = await fetchConAuth('/notificaciones/preferencias');
  await comprobarRespuesta(res, 'No se pudieron cargar las notificaciones');
  return res.json();
}

export async function guardarPreferenciasNotificaciones(preferencias: NotifPrefs): Promise<void> {
  const res = await fetchConAuth('/notificaciones/preferencias', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(preferencias),
  });
  await comprobarRespuesta(res, 'No se pudieron guardar las notificaciones');
}

export async function guardarRecordatoriosPersonalizados(recordatorios: RecordatorioPersonalizado[]): Promise<void> {
  const res = await fetchConAuth('/notificaciones/recordatorios', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recordatorios }),
  });
  await comprobarRespuesta(res, 'No se pudieron guardar los recordatorios');
}

/** Envía una notificación de prueba a este dispositivo — para comprobar de verdad que llegan, sin esperar a la hora de un recordatorio. */
export async function probarNotificacion(): Promise<void> {
  const res = await fetchConAuth('/push/probar', { method: 'POST' });
  await comprobarRespuestaConMotivo(res, 'No se pudo enviar la notificación de prueba');
}

// ── Cobros pendientes de un presupuesto (18/08/2026) ──

/** Un hito de cobro de un presupuesto. */
export type Cobro = {
  id: string;
  concepto: string;
  importe: number;
  /** Fecha ISO en la que se marcó como cobrado, o '' si sigue pendiente. */
  cobradoEn: string;
};

export async function actualizarCobros(presupuestoId: string, cobros: Cobro[]): Promise<Cobro[]> {
  const res = await fetchConAuth(`/presupuestos/${presupuestoId}/cobros`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cobros }),
  });
  await comprobarRespuesta(res, 'No se pudieron guardar los cobros');
  const data = await res.json();
  return data.presupuesto?.cobros ?? [];
}
