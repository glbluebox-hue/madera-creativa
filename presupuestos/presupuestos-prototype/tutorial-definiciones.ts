import type { DefinicionTutorial } from './tutorial-motor.js';

/**
 * Catálogo de tutoriales (Fase 1, 24/08/2026) — solo el tutorial de prueba
 * para validar el motor. Nada de negocio real: no sustituye ningún
 * tutorial futuro de "Primeros pasos"/"Clientes" (eso es Fase 3 en el
 * roadmap aprobado). Cada tutorial se añade aquí como una entrada más,
 * sin tocar el motor ni el overlay — es exactamente el punto de extensión
 * pedido ("añadir un tutorial nuevo sin reconstruir el sistema").
 *
 * Los `targetId` deben coincidir EXACTAMENTE con un atributo
 * `data-tutorial-id` real en la aplicación — ver dónde se añadió cada uno:
 * - 'nav-clientes' → botón "Clientes" del menú lateral (`presupuestos-prototype.tsx`)
 * - 'nuevo-cliente-btn' → botón "+" de la lista de clientes (`lista-clientes.tsx`)
 * - 'form-cliente-nombre' → campo "Nombre del cliente" del formulario (`formulario-cliente.tsx`)
 */
export const TUTORIAL_DEMO: DefinicionTutorial = {
  id: 'demo-fase-1',
  titulo: 'Tutorial de prueba (Fase 1)',
  pasos: [
    {
      id: 'demo-1-clientes',
      titulo: 'Clientes',
      texto: 'Aquí gestionas tus clientes y proyectos: fichas, obras, presupuestos y facturas de cada uno.',
      targetId: 'nav-clientes',
      posicion: 'derecha',
      tipo: 'informativo',
      // En móvil este botón vive dentro del cajón lateral, oculto por defecto — se abre solo antes de buscar el elemento.
      requiereMenuMovil: true,
    },
    {
      id: 'demo-2-nuevo-cliente',
      titulo: 'Crear un cliente',
      texto: 'Pulsa aquí para ver cómo se crea un cliente nuevo. Es un botón real — tu clic hará lo mismo que si no estuvieras en el tutorial.',
      targetId: 'nuevo-cliente-btn',
      posicion: 'izquierda',
      tipo: 'interactivo',
      seccionRequerida: 'clientes',
    },
    {
      id: 'demo-3-nombre',
      titulo: '¡Así de fácil!',
      texto: 'Aquí escribirías el nombre del cliente. Esto es solo una demostración del tutorial — puedes cerrar este formulario cuando quieras.',
      targetId: 'form-cliente-nombre',
      posicion: 'abajo',
      tipo: 'informativo',
    },
  ],
};

export const TUTORIALES: Record<string, DefinicionTutorial> = {
  [TUTORIAL_DEMO.id]: TUTORIAL_DEMO,
};
