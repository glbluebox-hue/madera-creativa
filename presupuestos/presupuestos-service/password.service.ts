import { hash, compare } from 'bcryptjs';

/**
 * Coste de bcrypt (número de rondas). 12 es el estándar recomendado para
 * hashing interactivo (login) en 2024+ — cada incremento dobla el coste
 * computacional del ataque de fuerza bruta.
 *
 * bcrypt solo usa los primeros 72 bytes de la contraseña; el resto se
 * ignora. No es un problema de seguridad práctico (72 caracteres ya es una
 * contraseña extremadamente larga), pero se documenta para que no
 * sorprenda a quien mantenga este código en el futuro.
 */
const RONDAS_BCRYPT = 12;

/**
 * Se eligió bcryptjs (implementación 100% JavaScript, sin bindings nativos)
 * en vez de Argon2 tras comprobar que las dos variantes de Argon2 con
 * binding nativo disponibles en npm (`@node-rs/argon2` y el paquete `argon2`
 * clásico) no resuelven correctamente su dependencia de plataforma dentro
 * de las raíces de dependencias aisladas que genera Bit con
 * `rootComponents: true` sin además relajar la política `allowScripts`.
 * bcryptjs no tiene esa fricción bajo ningún gestor de paquetes ni entorno
 * de despliegue, presente o futuro.
 */

/**
 * Hashea una contraseña en claro con bcrypt. El resultado incluye el coste
 * y la sal (formato `$2b$12$...`), por lo que no hace falta almacenarlos
 * por separado.
 */
export async function hashPassword(password: string): Promise<string> {
  return hash(password, RONDAS_BCRYPT);
}

/**
 * Verifica una contraseña en claro contra un hash bcrypt.
 */
export async function verificarPassword(password: string, hashBcrypt: string): Promise<boolean> {
  return compare(password, hashBcrypt);
}

/**
 * Replica el algoritmo de hash legado (no criptográfico) que usaban el
 * frontend y el backend antes de la migración a bcrypt.
 *
 * Existe únicamente para poder verificar contraseñas de cuentas creadas
 * antes de la migración y re-hashearlas con bcrypt en su siguiente login
 * correcto (ver el flujo de `/auth/login` en `presupuestos-service.app-root.ts`).
 * No debe usarse para hashear contraseñas nuevas.
 *
 * @deprecated Solo para verificación de compatibilidad durante la migración.
 */
export function calcularHashLegado(password: string): string {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const c = password.charCodeAt(i);
    hash = (hash << 5) - hash + c;
    hash |= 0;
  }
  return 'h' + Math.abs(hash).toString(36);
}

/**
 * Verifica una contraseña en claro contra un hash legado.
 * @deprecated Solo para verificación de compatibilidad durante la migración.
 */
export function verificarPasswordLegado(password: string, hashLegado: string): boolean {
  return calcularHashLegado(password) === hashLegado;
}
