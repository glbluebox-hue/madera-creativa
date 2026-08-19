/**
 * Código QR guardado (sección propia del menú lateral, 19/08/2026) — una
 * imagen ya diseñada por el usuario (ej. un cartel "escanéame y déjanos tu
 * reseña en Google"), no un código generado por la app. La imagen en sí
 * vive en la biblioteca de recursos (`api.subirRecurso`); aquí solo se
 * guarda el nombre y a qué recurso apunta.
 */
export type CodigoQRMC = {
  id: string;
  nombre: string;
  imagenUrl: string;
  creado: string;
};
