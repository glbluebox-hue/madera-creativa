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
/**
 * Sistema de tutoriales interactivos (24/08/2026) — deliberadamente muy por
 * encima del resto de la escala: el editor del Motor Documental ya se sale
 * de ella por su cuenta (`.barraFlotanteFormato` a 550 en
 * `editor-documento.module.css`, y la librería `react-moveable` fija sus
 * propios controles a 3000 en su CSS interno, fuera de nuestro control). Un
 * tutorial debe poder señalar CUALQUIER pantalla de la app, incluida esa,
 * así que necesita quedar por encima de ese techo real, no del documentado
 * aquí arriba.
 */
export const Z_TUTORIAL = 4000;
