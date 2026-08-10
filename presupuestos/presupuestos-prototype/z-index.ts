/**
 * Escala centralizada de z-index (Incremento 1.8). Antes había 6 valores
 * sueltos y sin relación entre sí (2, 10, 100, 300, 999, 9999) repartidos
 * en varios componentes — con eso, cualquier modal o capa nueva podía
 * acabar por detrás de otra sin que nadie lo hubiera decidido a propósito.
 *
 * Solo cubre capas que se solapan con el resto de la app (menús flotantes,
 * barras flotantes, modales, pantalla completa). Un indicador puramente
 * local dentro de su propio contenedor (p. ej. un "Procesando…" superpuesto
 * solo a la miniatura que lo contiene) no necesita entrar en esta escala:
 * no compite con nada fuera de ese contenedor.
 */
export const Z_DESPLEGABLE = 100;
export const Z_BARRA_FLOTANTE = 200;
export const Z_MODAL = 300;
export const Z_PANTALLA_COMPLETA = 400;
