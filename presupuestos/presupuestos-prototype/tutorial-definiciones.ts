import type { DefinicionTutorial } from './tutorial-motor.js';

/**
 * Catálogo de tutoriales — cada uno se añade aquí como una entrada más,
 * sin tocar el motor ni el overlay (el punto de extensión pedido:
 * "añadir un tutorial nuevo sin reconstruir el sistema").
 *
 * `TUTORIAL_APP` es UN ÚNICO recorrido secuencial por toda la aplicación,
 * en el orden real del menú lateral (Inicio → Clientes → Pizarra de
 * medición → Presupuestos → Facturas → Proveedores → Notas → Código QR) —
 * no un tutorial independiente por sección con un botón cada uno. Corrección
 * 24/08/2026: la primera versión creó `TUTORIAL_CLIENTES`/`TUTORIAL_PRESUPUESTOS`
 * como dos tutoriales separados con dos botones — el usuario aclaró que el
 * concepto real es un solo botón que hace "un giro panorámico de toda la
 * aplicación", sección por sección, en el orden del menú.
 *
 * Los `targetId` deben coincidir EXACTAMENTE con un atributo
 * `data-tutorial-id` real en la aplicación — ver dónde se añadió cada uno
 * (todos en `presupuestos-prototype.tsx` salvo los indicados):
 * - 'nav-inicio' → botón "Inicio" del menú lateral
 * - 'nav-clientes' → botón "Clientes" del menú lateral
 * - 'clientes-busqueda' → campo de búsqueda de la lista (`lista-clientes.tsx`)
 * - 'nuevo-cliente-btn' → botón "+" de la lista de clientes (`lista-clientes.tsx`)
 * - 'form-cliente-nombre' → campo "Nombre del cliente" del formulario (`formulario-cliente.tsx`)
 * - 'nav-dibujos' → botón "Pizarra de medición" del menú lateral
 * - 'dibujo-nuevo-btn' → botón "+" de la Pizarra de medición (`seccion-dibujos.tsx`)
 * - 'nav-presupuestos' → botón "Presupuestos" del menú lateral
 * - 'crear-presupuesto-btn' → botón "+" de la lista de presupuestos (`presupuestos-lista-global.tsx`)
 * - 'presupuesto-selector-cliente' → botón "+ Nuevo cliente" del selector de creación (`presupuestos-lista-global.tsx`)
 * - 'nav-facturas' → botón "Facturas" del menú lateral
 * - 'crear-factura-btn' → botón "+" de la lista de facturas (`facturas.tsx`)
 * - 'factura-escanear-btn' → botón "Escanear documento" del modal de nueva factura (`escaner-factura.tsx`)
 * - 'nav-proveedores' → botón "Proveedores" del menú lateral
 * - 'nuevo-proveedor-btn' → botón "+" de la lista de proveedores (`seccion-proveedores.tsx`)
 * - 'nav-notas' → botón "Notas" del menú lateral
 * - 'nav-codigos-qr' → botón "Código QR" del menú lateral
 */
export const TUTORIAL_APP: DefinicionTutorial = {
  id: 'app',
  titulo: 'Tutorial de Madera Creativa',
  pasos: [
    {
      id: 'app-01-inicio',
      titulo: 'Inicio',
      texto: 'Aquí tienes el resumen de tu actividad: ingresos, gastos, balance, presupuestos en curso y tus próximos montajes y mediciones.',
      targetId: 'nav-inicio',
      posicion: 'derecha',
      tipo: 'informativo',
      requiereMenuMovil: true,
    },
    {
      id: 'app-02-clientes',
      titulo: 'Clientes',
      texto: 'Aquí gestionas tus clientes y proyectos: fichas, obras, presupuestos y facturas de cada uno.',
      targetId: 'nav-clientes',
      posicion: 'derecha',
      tipo: 'informativo',
      requiereMenuMovil: true,
    },
    {
      id: 'app-03-busqueda',
      titulo: 'Buscar',
      texto: 'Escribe aquí para buscar por nombre de cliente o de proyecto. Los botones "Todos" / "Finalizados" filtran por estado.',
      targetId: 'clientes-busqueda',
      posicion: 'abajo',
      tipo: 'informativo',
      seccionRequerida: 'clientes',
    },
    {
      id: 'app-04-nuevo-cliente',
      titulo: 'Crear un cliente',
      texto: 'Pulsa aquí para crear un cliente y proyecto nuevo. Es un botón real — tu clic hará exactamente lo mismo que si no estuvieras en el tutorial.',
      targetId: 'nuevo-cliente-btn',
      posicion: 'izquierda',
      tipo: 'interactivo',
      seccionRequerida: 'clientes',
    },
    {
      id: 'app-05-nombre-cliente',
      titulo: 'Nombre del cliente',
      texto: 'Escribe aquí el nombre y apellidos del cliente. El resto de campos (teléfono, dirección, presupuesto…) son opcionales — puedes rellenarlos ahora o más tarde desde la ficha.',
      targetId: 'form-cliente-nombre',
      posicion: 'abajo',
      tipo: 'informativo',
    },
    {
      id: 'app-06-dibujos',
      titulo: 'Pizarra de medición',
      texto: 'Un lienzo para dibujar y tomar medidas a mano alzada durante una visita o mientras hablas con el cliente. Un dibujo se puede dejar suelto o asignarlo después a un cliente concreto.',
      targetId: 'nav-dibujos',
      posicion: 'derecha',
      tipo: 'informativo',
      requiereMenuMovil: true,
    },
    {
      id: 'app-06b-dibujo-nuevo',
      titulo: 'Nuevo dibujo',
      texto: 'Pulsa aquí para crear un dibujo nuevo. Es un botón real — tu clic hará exactamente lo mismo que si no estuvieras en el tutorial.',
      targetId: 'dibujo-nuevo-btn',
      posicion: 'izquierda',
      tipo: 'interactivo',
      seccionRequerida: 'dibujos',
    },
    {
      id: 'app-07-presupuestos',
      titulo: 'Presupuestos',
      texto: 'Aquí ves todos los presupuestos de todos tus clientes en un solo sitio, con su importe y su estado.',
      targetId: 'nav-presupuestos',
      posicion: 'derecha',
      tipo: 'informativo',
      requiereMenuMovil: true,
    },
    {
      id: 'app-08-crear-presupuesto',
      titulo: 'Crear un presupuesto',
      texto: 'Pulsa aquí para crear un presupuesto nuevo. Es un botón real — tu clic hará exactamente lo mismo que si no estuvieras en el tutorial.',
      targetId: 'crear-presupuesto-btn',
      posicion: 'izquierda',
      tipo: 'interactivo',
      seccionRequerida: 'presupuestos',
    },
    {
      id: 'app-09-opciones-presupuesto',
      titulo: 'Elige el cliente',
      texto: 'Primero eliges el cliente (uno nuevo o uno ya existente) y después cómo crear el presupuesto: en blanco, desde una plantilla guardada, o dejando que la IA lo redacte a partir de una descripción del trabajo.',
      targetId: 'presupuesto-selector-cliente',
      posicion: 'derecha',
      tipo: 'informativo',
    },
    {
      id: 'app-10-facturas',
      titulo: 'Facturas',
      texto: 'Aquí llevas el control de tus ingresos y gastos reales. El botón "Trimestres" agrupa todas las facturas del trimestre para Hacienda, listas para descargar.',
      targetId: 'nav-facturas',
      posicion: 'derecha',
      tipo: 'informativo',
      requiereMenuMovil: true,
    },
    {
      id: 'app-10b-factura-crear',
      titulo: 'Añadir una factura',
      texto: 'Pulsa aquí para añadir una factura nueva. Es un botón real — tu clic hará exactamente lo mismo que si no estuvieras en el tutorial.',
      targetId: 'crear-factura-btn',
      posicion: 'izquierda',
      tipo: 'interactivo',
      seccionRequerida: 'facturas',
    },
    {
      id: 'app-10c-factura-escanear',
      titulo: 'Escanear o subir',
      texto: 'Puedes escanear el documento con la cámara, hacerle una foto rápida o subir un PDF. Una vez tengas una imagen, la IA puede leerla y rellenar los datos por ti — solo revisas antes de guardar.',
      targetId: 'factura-escanear-btn',
      posicion: 'abajo',
      tipo: 'informativo',
    },
    {
      id: 'app-11-proveedores',
      titulo: 'Proveedores',
      texto: 'Tus proveedores y los materiales que utilizas, con sus precios — desde aquí los usas después al montar un presupuesto.',
      targetId: 'nav-proveedores',
      posicion: 'derecha',
      tipo: 'informativo',
      requiereMenuMovil: true,
    },
    {
      id: 'app-11b-proveedor-crear',
      titulo: 'Añadir un proveedor',
      texto: 'Pulsa aquí para añadir un proveedor nuevo. Es un botón real — tu clic hará exactamente lo mismo que si no estuvieras en el tutorial. Después podrás registrar los materiales que le compras, con su precio, en la pestaña "Catálogo".',
      targetId: 'nuevo-proveedor-btn',
      posicion: 'izquierda',
      tipo: 'interactivo',
      seccionRequerida: 'proveedores',
    },
    {
      id: 'app-12-notas',
      titulo: 'Notas',
      texto: 'Notas rápidas ligadas a un cliente o proyecto, con prioridad y estado — para no perder de vista lo pendiente.',
      targetId: 'nav-notas',
      posicion: 'derecha',
      tipo: 'informativo',
      requiereMenuMovil: true,
    },
    {
      id: 'app-13-codigos-qr',
      titulo: 'Código QR',
      texto: 'Guarda aquí imágenes de códigos QR que ya tengas preparados (por ejemplo, para pedir una reseña) y ábrelas a pantalla completa para que un cliente las escanee desde el móvil.',
      targetId: 'nav-codigos-qr',
      posicion: 'derecha',
      tipo: 'informativo',
      requiereMenuMovil: true,
    },
  ],
};

/**
 * Tutorial aparte, corto y autocontenido — SOLO la barra de herramientas
 * del editor de presupuestos (Motor Documental), sin tocar el lienzo ni
 * pedir ninguna interacción con los elementos que el usuario pueda tener
 * ya creados (la parte que la arquitectura original marcó como la más
 * delicada). Se abre con su propio botón "? Tutorial" en la barra superior
 * del editor — no forma parte de `TUTORIAL_APP`, ni el motor ni el overlay
 * necesitan saber nada de esto (mismo punto de extensión de siempre).
 *
 * `targetId` → dónde se añadió (todos en `editor-documento.tsx`):
 * - 'editor-barra-herramientas' → la barra de herramientas completa (añadir elementos, deshacer/rehacer…)
 * - 'editor-guardar-btn' → botón "Guardar" de la barra superior
 * - 'editor-ia-btn' → botón "✨ IA del presupuesto"
 */
export const TUTORIAL_EDITOR: DefinicionTutorial = {
  id: 'editor',
  titulo: 'Cómo funciona el editor',
  pasos: [
    {
      id: 'editor-01-herramientas',
      titulo: 'Barra de herramientas',
      texto: 'Aquí añades elementos al presupuesto: texto, imágenes, tablas, formas… y tienes deshacer/rehacer, duplicar, alinear y agrupar.',
      targetId: 'editor-barra-herramientas',
      posicion: 'abajo',
      tipo: 'informativo',
    },
    {
      id: 'editor-02-guardar',
      titulo: 'Guardar',
      texto: 'El presupuesto se guarda solo mientras trabajas, pero puedes forzar un guardado en cualquier momento desde aquí.',
      targetId: 'editor-guardar-btn',
      posicion: 'abajo',
      tipo: 'informativo',
    },
    {
      id: 'editor-03-ia',
      titulo: 'IA del presupuesto',
      texto: 'Selecciona un elemento de texto y usa este botón para pedirle a la IA que te ayude a redactarlo o mejorarlo.',
      targetId: 'editor-ia-btn',
      posicion: 'abajo',
      tipo: 'informativo',
    },
  ],
};

export const TUTORIALES: Record<string, DefinicionTutorial> = {
  [TUTORIAL_APP.id]: TUTORIAL_APP,
  [TUTORIAL_EDITOR.id]: TUTORIAL_EDITOR,
};
