import type { DefinicionTutorial } from './tutorial-motor.js';

/**
 * Catálogo de tutoriales — cada uno se añade aquí como una entrada más,
 * sin tocar el motor ni el overlay (el punto de extensión pedido:
 * "añadir un tutorial nuevo sin reconstruir el sistema").
 *
 * Los `targetId` deben coincidir EXACTAMENTE con un atributo
 * `data-tutorial-id` real en la aplicación — ver dónde se añadió cada uno:
 * - 'nav-clientes' → botón "Clientes" del menú lateral (`presupuestos-prototype.tsx`)
 * - 'clientes-busqueda' → campo de búsqueda de la lista (`lista-clientes.tsx`)
 * - 'nuevo-cliente-btn' → botón "+" de la lista de clientes (`lista-clientes.tsx`)
 * - 'form-cliente-nombre' → campo "Nombre del cliente" del formulario (`formulario-cliente.tsx`)
 * - 'nav-presupuestos' → botón "Presupuestos" del menú lateral (`presupuestos-prototype.tsx`)
 * - 'crear-presupuesto-btn' → botón "+" de la lista de presupuestos (`presupuestos-lista-global.tsx`)
 * - 'presupuesto-selector-cliente' → botón "+ Nuevo cliente" del selector de creación (`presupuestos-lista-global.tsx`)
 */
export const TUTORIAL_CLIENTES: DefinicionTutorial = {
  id: 'clientes',
  titulo: 'Clientes',
  pasos: [
    {
      id: 'clientes-1-nav',
      titulo: 'Clientes',
      texto: 'Aquí gestionas tus clientes y proyectos: fichas, obras, presupuestos y facturas de cada uno.',
      targetId: 'nav-clientes',
      posicion: 'derecha',
      tipo: 'informativo',
      // En móvil este botón vive dentro del cajón lateral, oculto por defecto — se abre solo antes de buscar el elemento.
      requiereMenuMovil: true,
    },
    {
      id: 'clientes-2-busqueda',
      titulo: 'Buscar',
      texto: 'Escribe aquí para buscar por nombre de cliente o de proyecto. Los botones "Todos" / "Finalizados" filtran por estado.',
      targetId: 'clientes-busqueda',
      posicion: 'abajo',
      tipo: 'informativo',
      seccionRequerida: 'clientes',
    },
    {
      id: 'clientes-3-nuevo',
      titulo: 'Crear un cliente',
      texto: 'Pulsa aquí para crear un cliente y proyecto nuevo. Es un botón real — tu clic hará exactamente lo mismo que si no estuvieras en el tutorial.',
      targetId: 'nuevo-cliente-btn',
      posicion: 'izquierda',
      tipo: 'interactivo',
      seccionRequerida: 'clientes',
    },
    {
      id: 'clientes-4-nombre',
      titulo: 'Nombre del cliente',
      texto: 'Escribe aquí el nombre y apellidos del cliente. El resto de campos (teléfono, dirección, presupuesto…) son opcionales — puedes rellenarlos ahora o más tarde desde la ficha.',
      targetId: 'form-cliente-nombre',
      posicion: 'abajo',
      tipo: 'informativo',
    },
  ],
};

export const TUTORIAL_PRESUPUESTOS: DefinicionTutorial = {
  id: 'presupuestos',
  titulo: 'Presupuestos',
  pasos: [
    {
      id: 'presupuestos-1-nav',
      titulo: 'Presupuestos',
      texto: 'Aquí ves todos los presupuestos de todos tus clientes en un solo sitio, con su importe y su estado.',
      targetId: 'nav-presupuestos',
      posicion: 'derecha',
      tipo: 'informativo',
      requiereMenuMovil: true,
    },
    {
      id: 'presupuestos-2-crear',
      titulo: 'Crear un presupuesto',
      texto: 'Pulsa aquí para crear un presupuesto nuevo. Es un botón real — tu clic hará exactamente lo mismo que si no estuvieras en el tutorial.',
      targetId: 'crear-presupuesto-btn',
      posicion: 'izquierda',
      tipo: 'interactivo',
      seccionRequerida: 'presupuestos',
    },
    {
      id: 'presupuestos-3-opciones',
      titulo: 'Elige el cliente',
      texto: 'Primero eliges el cliente (uno nuevo o uno ya existente) y después cómo crear el presupuesto: en blanco, desde una plantilla guardada, o dejando que la IA lo redacte a partir de una descripción del trabajo.',
      targetId: 'presupuesto-selector-cliente',
      posicion: 'derecha',
      tipo: 'informativo',
    },
  ],
};

export const TUTORIALES: Record<string, DefinicionTutorial> = {
  [TUTORIAL_CLIENTES.id]: TUTORIAL_CLIENTES,
  [TUTORIAL_PRESUPUESTOS.id]: TUTORIAL_PRESUPUESTOS,
};
