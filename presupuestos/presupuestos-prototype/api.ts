import type { Cliente, Factura } from './types.js';
import type { Empresa } from './use-empresa.js';

const BASE = '/api/presupuestos-service';

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

/* ===== FACTURAS ===== */

/**
 * Lista todas las facturas (sin imagen base64).
 */
export async function obtenerFacturas(): Promise<Factura[]> {
  const res = await fetchConAuth('/facturas');
  await comprobarRespuesta(res, 'No se pudieron cargar las facturas');
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
 * Recupera todas las fichas de cliente desde el servidor.
 * @returns Lista de clientes.
 */
export async function obtenerClientes(): Promise<Cliente[]> {
  const res = await fetchConAuth('/clientes');
  await comprobarRespuesta(res, 'No se pudieron cargar los clientes'); // incluye código HTTP para detectar 401
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
 * Borra una ficha de cliente del servidor.
 * @param id Identificador del cliente.
 */
export async function borrarCliente(id: string): Promise<void> {
  const res = await fetchConAuth(`/clientes/${id}`, { method: 'DELETE' });
  await comprobarRespuesta(res, 'No se pudo borrar el cliente');
}

/**
 * Recupera la configuración de empresa desde el servidor.
 * @returns Datos de la empresa.
 */
export async function obtenerEmpresa(): Promise<Empresa> {
  const res = await fetchConAuth('/empresa');
  await comprobarRespuesta(res, 'No se pudo cargar la empresa');
  const data = await res.json();
  return { nombre: data.nombre, eslogan: data.eslogan, logo: data.logo || null };
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
  return { nombre: data.nombre, eslogan: data.eslogan, logo: data.logo || null };
}
