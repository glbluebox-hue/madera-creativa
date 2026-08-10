/** Paleta de avatares — ciclo fijo de tokens de marca ya existentes, sin introducir colores nuevos. */
const COLORES_AVATAR = ['var(--azul)', 'var(--topo)', 'var(--morado)', 'var(--ocre)', 'var(--verde)'];

/** Color determinista (mismo id → mismo color siempre) para el avatar de un cliente. */
export function colorAvatar(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return COLORES_AVATAR[Math.abs(h) % COLORES_AVATAR.length];
}

/** Iniciales (1 o 2 letras) a partir del nombre completo, para el avatar. */
export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].charAt(0).toUpperCase();
  return (partes[0].charAt(0) + partes[1].charAt(0)).toUpperCase();
}
