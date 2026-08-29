import { Schema, model, models, Model } from 'mongoose';
import { conectarMongo } from './mongo-conexion.js';

/** Subdocumento de un movimiento económico (gasto o ingreso). */
const MovimientoSchema = new Schema(
  {
    id: { type: String, required: true },
    fecha: { type: String, required: true },
    concepto: { type: String, required: true },
    categoria: { type: String, default: 'General' },
    tipo: { type: String, enum: ['gasto', 'ingreso'], required: true },
    importe: { type: Number, required: true },
    /**
     * Id de la Factura que generó este movimiento (Fase 2 — sincronización
     * Factura→Movimiento). Vacío/ausente en movimientos creados a mano desde
     * la tabla de gastos e ingresos — nunca migra datos antiguos. Es la
     * clave para que la sincronización sea idempotente: al reguardar la
     * misma factura se busca por este campo en vez de crear una fila nueva.
     */
    facturaId: { type: String, default: '' },
  },
  { _id: false }
);

/** Subdocumento de un registro de horas trabajadas. */
const HorasSchema = new Schema(
  {
    id: { type: String, required: true },
    fecha: { type: String, required: true },
    tarea: { type: String, required: true },
    horas: { type: Number, required: true },
  },
  { _id: false }
);

/**
 * Metadatos comunes de un archivo subido a almacenamiento externo
 * (Incremento 1.7) — `claveAlmacenamiento` es interna (se usa para poder
 * borrar el archivo) y nunca se envía al frontend, ver `limpiarBlob()` en
 * `presupuestos-service.ts`. `tamano`/`tipoMime`/`subidoEn` quedan vacíos
 * en archivos guardados antes de este incremento (seguían embebidos en
 * Base64, sin subida a almacenamiento que registrar).
 */
const metadatosArchivo = {
  claveAlmacenamiento: { type: String, default: '' },
  tamano: { type: Number, default: 0 },
  tipoMime: { type: String, default: '' },
  subidoEn: { type: String, default: '' },
};

/** Subdocumento de una foto del proyecto acabado. */
const FotoSchema = new Schema(
  {
    id: { type: String, required: true },
    url: { type: String, required: true },
    descripcion: { type: String, default: '' },
    fecha: { type: String, required: true },
    ...metadatosArchivo,
  },
  { _id: false }
);

/** Subdocumento de un archivo adjunto del proyecto. */
const AdjuntoSchema = new Schema(
  {
    id: { type: String, required: true },
    nombre: { type: String, required: true },
    tipo: { type: String, required: true },
    tamano: { type: Number, required: true },
    url: { type: String, required: true },
    claveAlmacenamiento: { type: String, default: '' },
    subidoEn: { type: String, default: '' },
  },
  { _id: false }
);

/** Subdocumento de una tarea del checklist de proyecto (ver `tab-tareas.tsx`). */
const TareaSchema = new Schema(
  {
    id: { type: String, required: true },
    texto: { type: String, required: true },
    hecha: { type: Boolean, required: true },
  },
  { _id: false }
);

/** Subdocumento de una estancia medida (ver `TabMediciones`). */
const EstanciaSchema = new Schema(
  {
    id: { type: String, required: true },
    nombre: { type: String, required: true },
    ancho: { type: Number },
    alto: { type: Number },
    fondo: { type: Number },
    altura: { type: Number },
    anchura: { type: Number },
    profundidad: { type: Number },
    angulos: { type: String },
    desniveles: { type: String },
    escuadra: { type: String },
    observaciones: { type: String },
  },
  { _id: false }
);

/**
 * Ficha de identidad de un cliente — SOLO datos de contacto. Hasta el
 * incremento "Cliente ≠ Proyecto" (especificación del usuario, 20/08/2026),
 * este mismo esquema tenía además todos los campos de un trabajo concreto
 * (proyecto, dirección de obra, estado, presupuesto, mediciones, gastos...),
 * lo que mezclaba en un mismo documento la identidad de la persona con el
 * expediente de un trabajo — al crear un segundo proyecto para el mismo
 * cliente, sus gastos/ingresos/documentos se mezclaban con los del primero,
 * porque todo vivía en la misma ficha (reporte real del usuario).
 *
 * Los documentos YA guardados en la colección `clientes` siguen teniendo
 * físicamente todos esos campos antiguos — Mongoose simplemente ya no los
 * declara ni los lee/escribe aquí. `migracion-proyectos.ts` los traspasa a
 * `ProyectoModel` (mismo `id`, ver ese archivo) sin borrar ni modificar
 * ni un solo documento de esta colección.
 */
const ClienteSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  /** ID del usuario propietario — aísla los datos por cuenta. */
  usuarioId: { type: String, required: true, index: true, default: 'admin' },
  nombre: { type: String, required: true },
  telefono: { type: String, default: '' },
  email: { type: String, default: '' },
  /** DNI/NIE del cliente — dato de identidad (24/08/2026), para que aparezca en presupuestos/contratos sin tener que volver a pedirlo en cada proyecto. */
  dni: { type: String, default: '' },
  /**
   * Dirección del propio cliente (su domicilio/sede) — dato de identidad
   * (29/08/2026): un mismo cliente puede encargar varios proyectos, cada
   * uno con su obra en un sitio distinto (`ProyectoSchema.direccion`, más
   * abajo), así que la dirección del cliente no puede vivir en el proyecto
   * sin perderse o mezclarse entre encargos.
   */
  direccion: { type: String, default: '' },
  creado: { type: String, required: true },
});

/**
 * Un proyecto/expediente de trabajo — la gestión económica y documental
 * (gastos, ingresos, mediciones, tareas, fotos, adjuntos, dibujos) es
 * exclusiva de CADA proyecto, nunca compartida entre los distintos
 * proyectos de un mismo cliente. `clienteId` enlaza con la identidad
 * (`ClienteSchema`, arriba) — un cliente puede tener tantos `Proyecto`
 * como trabajos reales tenga, cada uno con su propio ciclo de vida
 * (`estado`) independiente. Mismo shape que el antiguo `ClienteSchema`
 * (sección "hoy" de arriba) menos los campos de identidad, para que
 * `migracion-proyectos.ts` pueda copiar cada ficha vieja tal cual, campo a
 * campo, sin perder ni transformar ningún dato existente.
 */
/**
 * Una característica estructurada del trabajo (Histórico Inteligente,
 * Fase 2A) — forma GENÉRICA a propósito: añadir una característica nueva
 * en el futuro (número de módulos, material, complejidad, o cualquiera
 * que un futuro análisis por fotografía llegue a producir) significa un
 * valor nuevo de `clave`, nunca un campo nuevo ni una migración.
 *
 * `origen`/`confirmadoPorUsuario`/`confianza` dejan sitio a una futura
 * fuente `'ia'` sin cambiar el esquema: una característica con
 * `confirmadoPorUsuario:false` no debe usarse jamás en comparables ni en
 * cálculos del histórico (regla de producto, no solo de datos) — en esta
 * fase esa distinción existe en la forma pero no se ejercita todavía:
 * la única vía de escritura real (`guardarCaracteristicaProyecto`,
 * `presupuestos-service.ts`) fija siempre `origen:'usuario'`,
 * `confirmadoPorUsuario:true`, `confianza:null`, decidido por el
 * servidor — nunca confiado del cliente.
 */
const CaracteristicaTrabajoSchema = new Schema(
  {
    clave: { type: String, required: true },
    valor: { type: String, required: true },
    origen: { type: String, enum: ['usuario', 'ia'], required: true },
    confirmadoPorUsuario: { type: Boolean, required: true },
    confianza: { type: String, enum: ['alta', 'media', 'baja', null], default: null },
    fecha: { type: String, required: true },
  },
  { _id: false }
);

/**
 * Trabajo extra acordado con el cliente durante la obra, después de fijar
 * el presupuesto inicial (pedido real, 28/08/2026: "el cliente me pide
 * otras cosas durante la obra, ¿cómo sumo esto al presupuesto?"). Cada
 * entrada queda como registro (qué se acordó y por cuánto) — el efecto en
 * el número "Presupuesto acordado" es un incremento atómico junto con el
 * `$push`, nunca un reemplazo, para no perder de vista el presupuesto
 * original si algún día hace falta desglosarlo.
 */
const TrabajoExtraSchema = new Schema(
  {
    id: { type: String, required: true },
    descripcion: { type: String, required: true },
    precio: { type: Number, required: true },
    fecha: { type: String, required: true },
  },
  { _id: false }
);

const ProyectoSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  usuarioId: { type: String, required: true, index: true, default: 'admin' },
  /** Cliente (identidad) al que pertenece este proyecto. */
  clienteId: { type: String, required: true, index: true },
  proyecto: { type: String, default: '' },
  direccion: { type: String, default: '' },
  presupuesto: { type: Number, default: 0 },
  tarifaHora: { type: Number, default: 0 },
  creado: { type: String, required: true },
  estado: {
    type: String,
    enum: ['presupuestado', 'en_curso', 'finalizado', 'rechazado'],
    default: 'presupuestado',
  },
  // Datos de acceso a la obra (pestaña "Datos").
  whatsapp: { type: String },
  ubicacion: { type: String },
  codigoPuerta: { type: String },
  planta: { type: String },
  ascensor: { type: Boolean },
  zonaCarga: { type: String },
  observacionesAcceso: { type: String },
  fechaMedicion: { type: String },
  fechaMontaje: { type: String },
  estancias: { type: [EstanciaSchema], default: [] },
  tareas: { type: [TareaSchema], default: [] },
  movimientos: { type: [MovimientoSchema], default: [] },
  trabajosExtra: { type: [TrabajoExtraSchema], default: [] },
  horas: { type: [HorasSchema], default: [] },
  adjuntos: { type: [AdjuntoSchema], default: [] },
  fotos: { type: [FotoSchema], default: [] },
  /**
   * `true` mientras el margen de este proyecto sigue por debajo del umbral
   * de aviso (notificación "margen bajo", 18/08/2026) — evita repetir el
   * aviso en cada comprobación mientras el margen sigue bajo. Se limpia en
   * cuanto el margen vuelve a subir por encima del umbral, para que una
   * caída posterior sí vuelva a avisar.
   */
  margenAvisado: { type: Boolean, default: false },
  /** Características estructuradas del trabajo (Histórico Inteligente, Fase 2A) — ver `CaracteristicaTrabajoSchema` arriba. Vacío en todo proyecto existente, nunca migrado ni inferido. */
  caracteristicas: { type: [CaracteristicaTrabajoSchema], default: [] },
});
ProyectoSchema.index({ usuarioId: 1, clienteId: 1, creado: -1 });

/** Esquema de configuración de empresa — uno por usuario. */
const EmpresaSchema = new Schema({
  /** ID del usuario propietario (reemplaza la clave fija 'empresa'). */
  usuarioId: { type: String, required: true, unique: true, index: true, default: 'admin' },
  nombre: { type: String, default: '' },
  /**
   * Nombre y apellidos del titular real de la actividad (autónomo) —
   * distinto de `nombre`, que es el nombre comercial/marca. Una factura de
   * ingreso real suele llevar el nombre legal del emisor, no la marca —
   * sin este campo, `resolverEmisorReceptor` (identificacion-factura.ts)
   * no podía reconocer al propio usuario como emisor en esas facturas.
   * Vacío hasta que el usuario lo rellena — nunca se infiere ni se copia
   * de otro sitio (hallazgo real, 25/08/2026).
   */
  titular: { type: String, default: '' },
  eslogan: { type: String, default: '' },
  logo: { type: String, default: '' },
  /** CIF/NIF de la propia empresa — para que aparezca en las facturas/presupuestos que ella misma emite. No confundir con el `cifNif` de cada Factura de gasto, que es del proveedor, no de esta empresa. */
  nifCif: { type: String, default: '' },
  /** Datos de contacto mostrados en la cabecera de los presupuestos con plantilla (Fase 6). */
  telefono: { type: String, default: '' },
  email: { type: String, default: '' },
  /** IBAN mostrado en los presupuestos con plantilla (Fase 6) — solo texto, sin validar formato. */
  iban: { type: String, default: '' },
  /** Valores por defecto que se copian (y quedan congelados) al crear un presupuesto en modo lienzo (Fase 6). */
  condicionesPagoDefecto: { type: String, default: '60% al aceptar el presupuesto / 40% al finalizar el trabajo.' },
  validezDiasDefecto: { type: Number, default: 30 },
  /**
   * Región fiscal del negocio (Fase Facturas Profesional) — determina qué
   * impuesto indirecto se calcula en el Trimestral: IGIC (Canarias) o IVA
   * (Península). Investigado con fuentes oficiales (AEAT / Agencia
   * Tributaria Canaria); ver auditoría 11/08/2026. Vacío hasta que el
   * usuario lo configura — el Trimestral no calcula ningún impuesto
   * indirecto hasta entonces, para no asumir una región equivocada.
   */
  regionFiscal: { type: String, enum: ['canarias', 'peninsula', ''], default: '' },
  /**
   * Ubicación estructurada del negocio (Fase 2F, "Consenso de Precio",
   * 29/08/2026) — determina qué mercado local investigar en el Consejero
   * de Precios: nunca se recomienda un precio de Madrid a una empresa de
   * Tenerife. `isla` solo aplica a Canarias/Baleares (una provincia
   * canaria agrupa varias islas con mercados de instalación distintos) y
   * tiene prioridad sobre `provincia` como nivel "local" cuando está
   * presente. Los tres vacíos hasta que el usuario los configura en
   * Ajustes de empresa — nunca se asume ninguna zona por defecto (mismo
   * criterio que `regionFiscal`/`margenObjetivoPorcentaje`).
   */
  comunidadAutonoma: { type: String, default: '' },
  provincia: { type: String, default: '' },
  isla: { type: String, default: '' },
  /**
   * REPEP (Régimen Especial del Pequeño Empresario o Profesional) — exime
   * del IGIC a autónomos canarios con hasta 50.000€/año de facturación,
   * activo desde julio 2026, voluntario (modelo 400). Solo relevante si
   * `regionFiscal === 'canarias'`. Decisión del usuario, nunca inferida.
   */
  repepActivo: { type: Boolean, default: false },
  /** Tema por defecto del Motor Documental (Incremento 3) — identidad corporativa: todo documento nuevo sin tema propio hereda este. `null` hasta que el usuario personalice uno. */
  temaPorDefecto: { type: Schema.Types.Mixed, default: null },
  /** Ancho en píxeles del logo en la barra lateral — ajustable a mano por el usuario (antes fijo a 187px en CSS). */
  logoTamano: { type: Number, default: 187 },
  /**
   * Minutos de inactividad antes de cerrar sesión sola y volver al login
   * (petición real, 25/08/2026) — `null` = nunca cerrar por inactividad.
   * Por defecto `null`: es una función de seguridad nueva, nadie debe
   * empezar a que se le cierre la sesión sin haberlo configurado a propósito.
   */
  tiempoInactividadMin: { type: Number, default: null },
  /**
   * Margen objetivo (%) del negocio (Inteligencia de Precios, Fase 1) —
   * usado por `inteligencia-precios.ts` para comparar el margen calculado
   * de cada presupuesto contra el objetivo del propio negocio. `null` =
   * sin configurar todavía: nunca se asume un 35% ni ningún otro valor por
   * defecto, así que un negocio que no ha entrado en Ajustes de empresa ve
   * "Datos insuficientes" en vez de una comparación inventada.
   */
  margenObjetivoPorcentaje: { type: Number, default: null },
  /**
   * Enlace de la ficha de Google My Business del negocio (sección
   * "Solicitud de reseñas", 20/08/2026) — destino final de los enlaces/QR
   * individuales por cliente (`enlace-resena.model.ts`). Por empresa, no
   * global: antes vivía como una constante fija en el backend, que enviaba
   * a TODOS los clientes de TODAS las cuentas a la ficha de Google de
   * Madera Creativa (hallazgo real del usuario, dueño de la cuenta admin,
   * al pensar en qué pasaría con una cuenta nueva). Vacío hasta que el
   * negocio lo configura en Ajustes de empresa — sin él, "Pedir reseña" no
   * se ofrece.
   */
  enlaceResenaGoogle: { type: String, default: '' },
  /**
   * Cartel de agradecimiento propio del negocio, en base64 (mismo patrón
   * que `logo`) — se muestra en la página de solicitud de reseña antes del
   * botón hacia Google. Opcional: vacío, la página se salta el cartel y
   * muestra solo el botón.
   */
  imagenResena: { type: String, default: '' },
  /**
   * Firma de la empresa, en base64 (mismo patrón que `logo`) — dibujada una
   * vez en Ajustes de empresa (petición explícita del usuario, 26/08/2026:
   * "yo lo pongo ahí, firmo, y en automático se refleja" en cada
   * presupuesto, igual que el logo). El elemento `firma_empresa` del Motor
   * Documental en modo 'vinculado' la lee de aquí en cada render.
   */
  firmaEmpresa: { type: String, default: '' },
});

/**
 * Esquema de proveedor (Fase "Integración completa"). Antes solo vivía en
 * el `localStorage` del navegador, sin persistencia real ni compartida —
 * este modelo recupera el patrón ya usado por Cliente/Factura.
 */
const ProveedorSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  usuarioId: { type: String, required: true, index: true, default: 'admin' },
  nombre: { type: String, required: true },
  contacto: { type: String, default: '' },
  /** CIF/NIF guardado una vez a mano — ver el campo equivalente en `types.ts` (frontend). */
  cifNif: { type: String, default: '' },
  telefono: { type: String, default: '' },
  email: { type: String, default: '' },
  direccion: { type: String, default: '' },
  codigoPostal: { type: String, default: '' },
  notas: { type: String, default: '' },
  creado: { type: String, required: true },
});

/** Esquema de producto/material del catálogo (mismo motivo que Proveedor). */
const ProductoSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  usuarioId: { type: String, required: true, index: true, default: 'admin' },
  nombre: { type: String, required: true },
  descripcion: { type: String, default: '' },
  unidad: { type: String, required: true },
  precio: { type: Number, required: true, default: 0 },
  proveedorId: { type: String, default: '' },
  fechaPrecio: { type: String, default: '' },
  categoria: { type: String, default: '' },
});

/**
 * Esquema de nota (rediseño del módulo de Notas) — colección propia, no
 * embebida en Cliente como antes (`Cliente.notas`, sin ni siquiera un
 * esquema declarado). Una nota puede existir sola (`clienteId`/`proyectoId`
 * vacíos) o asociada a un cliente y, en el futuro, a un proyecto —
 * `proyectoId` se deja preparado aunque hoy no exista todavía una entidad
 * "Proyecto" propia en la aplicación (`Cliente.proyecto` es solo texto).
 */
/** Un elemento de una nota de tipo "lista" — parecido a `Proyecto.tareas` (Tarea), pero embebido en la nota y con prioridad propia (petición explícita del usuario, 26/08/2026). */
const ItemListaSchema = new Schema(
  {
    id: { type: String, required: true },
    texto: { type: String, required: true },
    hecha: { type: Boolean, default: false },
    prioridad: { type: String, enum: ['alta', 'media', 'baja'], default: 'media' },
  },
  { _id: false }
);

const NotaSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  usuarioId: { type: String, required: true, index: true, default: 'admin' },
  titulo: { type: String, default: '' },
  contenido: { type: String, default: '' },
  /**
   * Petición real del usuario, 26/08/2026: una nota de texto libre no deja
   * tachar cosas sueltas una a una ("comprar pincel", "comprar lijas"...) —
   * `'lista'` convierte la nota en un checklist (`items`), igual que
   * `Proyecto.tareas` (`tab-tareas.tsx`) pero sin depender de un proyecto:
   * el banner "Cosas por hacer" del Inicio es la lista `'lista'` sin
   * `clienteId` de este usuario.
   */
  tipo: { type: String, enum: ['nota', 'lista'], default: 'nota' },
  items: { type: [ItemListaSchema], default: [] },
  prioridad: { type: String, enum: ['alta', 'media', 'baja'], default: 'media' },
  estado: { type: String, enum: ['abierta', 'hecha'], default: 'abierta' },
  clienteId: { type: String, default: '' },
  /** Proyecto/expediente al que pertenece — desde el incremento "Cliente ≠ Proyecto" (20/08/2026) es la clave real de aislamiento entre trabajos del mismo cliente; `clienteId` se mantiene para poder ver "todas las notas de este cliente" a través de sus proyectos. */
  proyectoId: { type: String, default: '' },
  etiquetas: { type: [String], default: [] },
  origen: { type: String, enum: ['texto', 'voz'], default: 'texto' },
  creado: { type: String, required: true },
  actualizado: { type: String, required: true },
});
NotaSchema.index({ usuarioId: 1, clienteId: 1 });
NotaSchema.index({ usuarioId: 1, proyectoId: 1 });
NotaSchema.index({ usuarioId: 1, creado: -1 });

/**
 * Referencia de Mercado (Fase 2F, "Consenso de Precio", 29/08/2026) —
 * anotación MANUAL de lo que el propio usuario conoce de su mercado local
 * (una guía de precios que ha leído, un competidor que ha visto anunciarse,
 * etc.), nunca obtenida por scraping ni por IA (ver auditoría "Brújula de
 * Mercado"). Siempre aislada por `usuarioId` — el mercado externo puede
 * ser información pública, pero lo que UN usuario decide anotar sobre su
 * zona es suyo, nunca visible para otra empresa (autorización, condición 8).
 *
 * `zona` debe coincidir EXACTAMENTE con el campo de ubicación de Empresa al
 * que corresponde (`isla`/`provincia` para `nivelGeografico:'local'`,
 * `comunidadAutonoma` para `'regional'`, literal `'España'` para
 * `'nacional'`) — así `resolverMercadoLocal` (frontend) puede comparar por
 * igualdad exacta, sin ambigüedad de texto libre.
 */
const ReferenciaMercadoSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  usuarioId: { type: String, required: true, index: true },
  tipoTrabajo: { type: String, required: true },
  nivelGeografico: { type: String, enum: ['local', 'regional', 'nacional'], required: true },
  zona: { type: String, required: true },
  precioMin: { type: Number, required: true, min: 0 },
  precioMax: { type: Number, required: true, min: 0 },
  /** Texto libre — de dónde sale este dato (ej. "Habitissimo, guía de precios", "Competidor visto en Instagram"). Nunca oculto al usuario que lo consulta. */
  fuente: { type: String, default: '' },
  /** Fecha a la que corresponde el precio (no la fecha en la que se anota) — para poder aplicar la ventana de vigencia en el futuro. */
  fecha: { type: String, required: true },
  creado: { type: String, required: true },
  /**
   * Alcance real del trabajo (ampliación "Ficha Comparable", 29/08/2026,
   * auditoría "Filtro de Mercado") — obligatorio: sin esto, "cocina solo
   * mobiliario" y "cocina reforma integral" se mezclarían en el mismo
   * rango pese a diferir casi el doble en precio real observado.
   */
  alcance: { type: String, enum: ['solo_mobiliario', 'mobiliario_encimera', 'reforma_completa'], required: true },
  obraIncluida: { type: Boolean, default: false },
  /** `null` = no aplica o desconocido (solo tiene sentido declarado para cocinas) — nunca se asume `false`. */
  electrodomesticosIncluidos: { type: Boolean, default: null },
  /** `null` = desconocido — nunca se asume "estándar" por defecto. */
  nivelCalidad: { type: String, enum: ['economico', 'estandar', 'alto', null], default: null },
  tamano: { type: Number, default: null },
  unidad: { type: String, enum: ['total', 'm2', 'metro_lineal', 'unidad'], default: 'total' },
  /** `false` = no se sabe si el precio incluye IGIC/IVA — nunca se adivina la tasa (reduce el techo de confianza). */
  impuestosConocidos: { type: Boolean, default: false },
  /** Un precio 'desde' nunca se trata como rango completo ni como techo de mercado — ver `mercado-local.ts`. */
  tipoPrecio: { type: String, enum: ['publicado', 'medio', 'desde', 'indice_oficial'], default: 'publicado' },
  /** Único valor posible hoy — declarado explícito para no migrar de nuevo el día que exista una fuente oficial/comercial verificada. */
  origen: { type: String, enum: ['manual'], default: 'manual' },
});
ReferenciaMercadoSchema.index({ usuarioId: 1, tipoTrabajo: 1 });

/**
 * Código QR guardado (imagen ya diseñada por el usuario, ej. un cartel
 * "escanéame y déjanos tu reseña en Google") — sección nueva del menú
 * lateral, independiente de cualquier cliente. La imagen en sí se sube a
 * través de la biblioteca de recursos ya existente (`subirRecursoBiblioteca`,
 * deduplicación por hash) — aquí solo se guarda el nombre y a qué recurso
 * apunta, mismo criterio que el resto del Motor Documental ("nunca Base64
 * embebido en el propio documento/registro").
 */
const CodigoQRSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  usuarioId: { type: String, required: true, index: true, default: 'admin' },
  nombre: { type: String, required: true },
  imagenUrl: { type: String, required: true },
  creado: { type: String, required: true },
});
CodigoQRSchema.index({ usuarioId: 1, creado: -1 });

/** Elemento de precio individual dentro del alcance de un presupuesto (Fase 5, IA agente). */
const ElementoPresupuestoSchema = new Schema(
  {
    id: { type: String, required: true },
    concepto: { type: String, required: true },
    precio: { type: Number, required: true },
  },
  { _id: false }
);

/**
 * Un hito de cobro dentro de un presupuesto aceptado (roadmap, notificación
 * de "cobros pendientes" — 18/08/2026). Se genera automáticamente al
 * aceptar (ver `generarCobrosDesdeCondiciones` en `presupuestos-service.ts`,
 * a partir del texto libre de `condicionesPago`), pero es editable a mano
 * en todo momento — el propio usuario pidió esto explícitamente porque el
 * alcance de un presupuesto cambia durante la obra y el importe pactado ya
 * no tiene por qué coincidir con el original.
 */
const CobroSchema = new Schema(
  {
    id: { type: String, required: true },
    concepto: { type: String, required: true },
    importe: { type: Number, required: true },
    /** Fecha ISO en la que se marcó como cobrado, o `''` si sigue pendiente. */
    cobradoEn: { type: String, default: '' },
  },
  { _id: false }
);

/**
 * Snapshot del análisis de precio (Inteligencia de Precios, Fase 1) —
 * congelado en el momento en que se acepta el presupuesto
 * (`ejecutarConsecuenciasAceptacion`, `inteligencia-precios.ts`), nunca
 * recalculado retroactivamente: es "lo que pensábamos cuando se aceptó",
 * no un valor en vivo. Antes de la aceptación, la interfaz calcula el
 * análisis en el momento (mismo motor, en el frontend) sin persistir nada
 * — este subdocumento solo existe para poder comparar más adelante ese
 * cálculo original con el coste/margen real del proyecto ya terminado
 * (preparación para la fase futura de Histórico, ver la especificación).
 * Ausente (`null`) en presupuestos creados antes de esta fase o que nunca
 * se aceptaron con datos suficientes — nunca tratar su ausencia como cero.
 */
const AnalisisPrecioSchema = new Schema(
  {
    precio: { type: Number, required: true },
    costeEstimado: { type: Number, required: true },
    margenPorcentaje: { type: Number, required: true },
    margenObjetivoPorcentaje: { type: Number, required: true },
    diferenciaPuntos: { type: Number, required: true },
    estado: { type: String, enum: ['por_encima', 'cerca', 'por_debajo'], required: true },
    fecha: { type: String, required: true },
  },
  { _id: false }
);

/**
 * Esquema de presupuesto — tres formatos conviven en la misma colección,
 * `formato` explícito, nunca inferido:
 * - `'simple'` (Fase 5, sin cambios): descripción + alcance (bullets sin
 *   precio) + items con precio propio + precio total editable a mano. Es
 *   el único formato que crean/modifican las herramientas de IA
 *   (`crearPresupuesto`/`anadirElementoPresupuesto`, `ia-herramientas-presupuestos.ts`)
 *   — no se toca nada de este modo.
 * - `'lienzo'` (Fase 6) — **editor LEGADO, en transición** (ver
 *   `ARQUITECTURA-MOTOR-DOCUMENTAL.md`, sección "Transición desde el
 *   editor legado"): documento con plantilla libre sobre Excalidraw.
 *   `contenidoLienzo` sigue siendo del mismo tipo `Mixed` sin forma fija
 *   que antes — no se toca ni se añaden funciones nuevas a este formato.
 *   Ningún documento nuevo se crea ya así; solo sigue existiendo para
 *   poder abrir/editar los que ya hubiera. Se retira por completo
 *   (campo, editor y procesado) en cuanto no quede ninguno real.
 * - `'documento'` (Motor Documental, Incremento 1 en adelante): el
 *   formato definitivo. `contenidoDocumento` es un `DocumentoMC` real,
 *   validado contra `documento-modelo.ts`/`documento-registro-tipos.ts`
 *   — a diferencia de `contenidoLienzo`, su estructura SÍ es propia de
 *   esta aplicación, nunca de una librería de render (Regla de Oro 1).
 * Asociado siempre a un cliente ya existente (`clienteId` obligatorio, a
 * diferencia de Nota que puede vivir sin cliente).
 */
const PresupuestoSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  usuarioId: { type: String, required: true, index: true, default: 'admin' },
  clienteId: { type: String, required: true, index: true },
  /** Proyecto/expediente al que pertenece (incremento "Cliente ≠ Proyecto", 20/08/2026) — `''` en presupuestos guardados antes de ese incremento, hasta que pasen por `migracion-proyectos.ts`. */
  proyectoId: { type: String, default: '', index: true },
  titulo: { type: String, required: true },
  formato: { type: String, enum: ['simple', 'lienzo', 'documento'], default: 'simple' },
  /**
   * Estado de aceptación del presupuesto (Fase 1 — automatización
   * "presupuesto aceptado"). Campo nuevo, con default — no migra ni
   * afecta a presupuestos ya guardados. Aviso: `.lean()` NO aplica este
   * default a documentos antiguos que no tengan el campo en absoluto (ya
   * confirmado con `Usuario.acceso` en esta misma base de código) — el
   * código que lo lee nunca debe asumir que viene poblado, ver
   * `aceptarPresupuesto` en `presupuestos-service.ts`.
   */
  estado: { type: String, enum: ['borrador', 'enviado', 'aceptado', 'rechazado'], default: 'borrador' },
  descripcion: { type: String, default: '' },
  alcance: { type: [String], default: [] },
  items: { type: [ElementoPresupuestoSchema], default: [] },
  /** LEGADO — escena de Excalidraw ({ elements, files }), solo con contenido cuando `formato === 'lienzo'`. Sin funciones nuevas, ver nota de arriba. */
  contenidoLienzo: { type: Schema.Types.Mixed, default: {} },
  /** `DocumentoMC` real, solo con contenido cuando `formato === 'documento'` — campo independiente de `contenidoLienzo`, nunca reutilizado entre los dos formatos. */
  contenidoDocumento: { type: Schema.Types.Mixed, default: {} },
  /** Copiadas desde `Empresa.condicionesPagoDefecto`/`validezDiasDefecto` al crear, y congeladas a partir de ahí (Fase 6). */
  condicionesPago: { type: String, default: '' },
  validezDias: { type: Number, default: 30 },
  condicionesGenerales: { type: String, default: '' },
  precioTotal: { type: Number, default: 0 },
  creado: { type: String, required: true },
  actualizado: { type: String, required: true },
  /**
   * Firma del cliente al aceptar desde el Portal del cliente (enlace
   * público). Deliberadamente EXCLUIDOS de `esquemaPresupuestoMC` (Zod) —
   * mismo patrón que `estado` — así un guardado normal del carpintero
   * nunca puede pisarlos; solo los escribe `aceptarPresupuestoPublico`.
   */
  firmaClienteUrl: { type: String, default: '' },
  firmaClienteFecha: { type: String, default: '' },
  /**
   * Hitos de cobro (roadmap "cobros pendientes", 18/08/2026). Generados al
   * aceptar, EXCLUIDOS de `esquemaPresupuestoMC` a propósito (mismo patrón
   * que `estado`/`firmaClienteUrl`) — así un guardado normal del editor de
   * presupuesto nunca puede pisarlos; solo los tocan `aceptarPresupuesto` y
   * `actualizarCobros`.
   */
  cobros: { type: [CobroSchema], default: [] },
  /**
   * Snapshot del análisis de precio en el momento de la aceptación —
   * EXCLUIDO a propósito de `esquemaPresupuestoMC` (mismo patrón que
   * `estado`/`firmaClienteUrl`/`cobros`), así que un guardado normal del
   * editor nunca puede pisarlo; solo lo escribe
   * `ejecutarConsecuenciasAceptacion`. Ver `AnalisisPrecioSchema` arriba.
   */
  analisisPrecio: { type: AnalisisPrecioSchema, default: null },
});
PresupuestoSchema.index({ usuarioId: 1, clienteId: 1, creado: -1 });

/**
 * Plantilla del Motor Documental (Incremento 4) — catalogada aparte, no
 * vive dentro de ningún presupuesto/cliente concreto. `documentoBase`
 * guarda el `DocumentoMC` con variables `{{clave}}` sin resolver.
 */
const PlantillaSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  usuarioId: { type: String, required: true, index: true, default: 'admin' },
  nombre: { type: String, required: true },
  ambito: { type: String, enum: ['corporativa', 'usuario', 'compartida', 'ia'], default: 'usuario' },
  documentoBase: { type: Schema.Types.Mixed, required: true },
  creadoEn: { type: String, required: true },
  actualizadoEn: { type: String, required: true },
});
PlantillaSchema.index({ usuarioId: 1, creadoEn: -1 });

/**
 * Recurso de la biblioteca compartida (Motor Documental, Incremento 5) —
 * catálogo aparte, `hashContenido` indexado para la deduplicación (ver
 * `documento-recursos-biblioteca.ts`).
 */
const RecursoSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  usuarioId: { type: String, required: true, index: true, default: 'admin' },
  nombre: { type: String, required: true },
  tipo: { type: String, enum: ['logo', 'icono', 'imagen', 'fondo', 'sello', 'otro'], default: 'otro' },
  url: { type: String, required: true },
  claveAlmacenamiento: { type: String, required: true },
  mimeType: { type: String, required: true },
  tamano: { type: Number, default: 0 },
  hashContenido: { type: String, required: true },
  ambito: { type: String, enum: ['corporativa', 'usuario'], default: 'usuario' },
  etiquetas: { type: [String], default: [] },
  creadoEn: { type: String, required: true },
});
RecursoSchema.index({ usuarioId: 1, hashContenido: 1 });
RecursoSchema.index({ usuarioId: 1, creadoEn: -1 });

/**
 * Componente reutilizable (Motor Documental, Incremento 6) — catálogo
 * aparte, igual que Plantilla/Recurso. `elementos` es `Mixed` porque su
 * forma exacta depende del registro de tipos (no se modela en Mongoose).
 */
const ComponenteSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  usuarioId: { type: String, required: true, index: true, default: 'admin' },
  nombre: { type: String, required: true },
  tipo: { type: String, enum: ['cabecera', 'pie', 'firma', 'condiciones', 'bloqueCorporativo', 'libre'], default: 'libre' },
  elementos: { type: Schema.Types.Mixed, default: [] },
  ambito: { type: String, enum: ['corporativa', 'usuario'], default: 'usuario' },
  creadoEn: { type: String, required: true },
  actualizadoEn: { type: String, required: true },
});
ComponenteSchema.index({ usuarioId: 1, creadoEn: -1 });

/**
 * Automatización por eventos (Motor Documental, Incremento 11) — catálogo
 * aparte, igual que Plantilla/Recurso/Componente. `condicion`/`configuracionAccion`
 * son `Mixed` porque su forma depende de la `accion` elegida (ver
 * `esquemaAutomatizacionMC` en `esquemas-validacion.ts`).
 */
const AutomatizacionSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  usuarioId: { type: String, required: true, index: true, default: 'admin' },
  nombre: { type: String, required: true },
  evento: { type: String, required: true, index: true },
  activa: { type: Boolean, default: true },
  condicion: { type: Schema.Types.Mixed, default: {} },
  accion: { type: String, enum: ['crearDocumento', 'modificarElemento', 'notificar'], required: true },
  configuracionAccion: { type: Schema.Types.Mixed, default: {} },
  creadoEn: { type: String, required: true },
  actualizadoEn: { type: String, required: true },
});
AutomatizacionSchema.index({ usuarioId: 1, evento: 1, activa: 1 });

/**
 * Contrato (Motor Documental, Incremento 12 — segundo tipo de documento) —
 * prueba real de que el núcleo se reutiliza sin cambios: a diferencia de
 * Presupuesto, nace ya como `DocumentoMC` puro desde el primer día, sin
 * `formato`/`contenidoLienzo` (esa dualidad es una transición histórica
 * propia de Presupuesto, no algo que todo tipo de documento deba arrastrar).
 */
const ContratoSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  usuarioId: { type: String, required: true, index: true, default: 'admin' },
  clienteId: { type: String, required: true, index: true },
  /** Proyecto/expediente al que pertenece (incremento "Cliente ≠ Proyecto", 20/08/2026) — `''` en contratos guardados antes de ese incremento, hasta que pasen por `migracion-proyectos.ts`. */
  proyectoId: { type: String, default: '', index: true },
  titulo: { type: String, required: true },
  contenidoDocumento: { type: Schema.Types.Mixed, default: {} },
  creado: { type: String, required: true },
  actualizado: { type: String, required: true },
});
ContratoSchema.index({ usuarioId: 1, clienteId: 1, creado: -1 });

/**
 * Índice compuesto para `listarClientes` paginado (Incremento 1.5), que
 * filtra por `usuarioId` y ordena por `creado` descendente — la misma
 * consulta de Factura que ya se indexó en el Incremento 1.1. Se dejó
 * pendiente entonces porque `listarClientes` no tenía `sort`; ahora que la
 * paginación lo necesita, aplica exactamente el mismo criterio.
 */
ClienteSchema.index({ usuarioId: 1, creado: -1 });

/** Modelo Mongoose de Cliente — identidad (nombre/teléfono/email), reutiliza el existente si ya está registrado. */
export const ClienteModel: Model<any> = models.Cliente || model('Cliente', ClienteSchema);

/**
 * Modelo Mongoose de Proyecto — colección nueva `proyectos` (incremento
 * "Cliente ≠ Proyecto", 20/08/2026). `migracion-proyectos.ts` la puebla a
 * partir de los documentos existentes en `clientes`, sin tocarlos.
 */
export const ProyectoModel: Model<any> = models.Proyecto || model('Proyecto', ProyectoSchema);

/**
 * Modelo Mongoose de Proveedor. Sin nombre de colección explícito: Mongoose
 * la llama `proveedors` (pluralización automática de "Proveedor") — se
 * mantiene así a propósito para que coincida exactamente con la colección
 * real ya existente en la base de datos (verificado antes de escribir este
 * modelo), no una elección de estilo.
 */
export const ProveedorModel: Model<any> = models.Proveedor || model('Proveedor', ProveedorSchema);

/** Modelo Mongoose de Nota — colección nueva, sin nombre de colección heredado que respetar. */
export const NotaModel: Model<any> = models.Nota || model('Nota', NotaSchema);

/** Modelo Mongoose de Referencia de Mercado (Fase 2F, "Consenso de Precio") — colección nueva. */
export const ReferenciaMercadoModel: Model<any> = models.ReferenciaMercado || model('ReferenciaMercado', ReferenciaMercadoSchema);

/** Modelo Mongoose de Código QR guardado — colección nueva. */
export const CodigoQRModel: Model<any> = models.CodigoQR || model('CodigoQR', CodigoQRSchema);

/** Modelo Mongoose de Plantilla (Motor Documental, Incremento 4) — colección nueva. */
export const PlantillaModel: Model<any> = models.Plantilla || model('Plantilla', PlantillaSchema);

/** Modelo Mongoose de Recurso (Motor Documental, Incremento 5) — colección nueva. */
export const RecursoModel: Model<any> = models.Recurso || model('Recurso', RecursoSchema);

/** Modelo Mongoose de Componente (Motor Documental, Incremento 6) — colección nueva. */
export const ComponenteModel: Model<any> = models.Componente || model('Componente', ComponenteSchema);

/** Modelo Mongoose de Automatización (Motor Documental, Incremento 11) — colección nueva. */
export const AutomatizacionModel: Model<any> = models.Automatizacion || model('Automatizacion', AutomatizacionSchema);

/** Modelo Mongoose de Contrato (Motor Documental, Incremento 12) — colección nueva. */
export const ContratoModel: Model<any> = models.Contrato || model('Contrato', ContratoSchema);

/** Modelo Mongoose de Presupuesto (Fase 5) — colección nueva. */
export const PresupuestoModel: Model<any> = models.Presupuesto || model('Presupuesto', PresupuestoSchema);

/** Modelo Mongoose de Producto/material del catálogo. */
export const ProductoModel: Model<any> = models.Producto || model('Producto', ProductoSchema);

/** Modelo Mongoose de Empresa. */
export const EmpresaModel: Model<any> = models.Empresa || model('Empresa', EmpresaSchema);

/** Esquema de una factura (gasto o ingreso). */
const FacturaSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  /** ID del usuario propietario. */
  usuarioId: { type: String, required: true, index: true, default: 'admin' },
  tipo: { type: String, enum: ['ingreso', 'gasto'], required: true },
  fecha: { type: String, required: true },
  concepto: { type: String, default: '' },
  importe: { type: Number, required: true },
  proveedor: { type: String, default: '' },
  clienteId: { type: String, default: '' },
  imagen: { type: String, default: '' },
  /**
   * Clave interna del bucket privado de facturas (Incremento "Facturas
   * privadas", 27/08/2026) — cuando existe, `imagen` deja de ser una URL
   * pública permanente y pasa a resolverse en cada lectura como una URL
   * firmada temporal (`resolverUrlsFactura`, `presupuestos-service.ts`).
   * Vacía en facturas guardadas antes de este incremento — esas siguen
   * sirviéndose con la URL pública de siempre, sin romper nada.
   */
  imagenClave: { type: String, default: '' },
  /**
   * Páginas adicionales del documento multihoja — el frontend ya las
   * construye y `esquemaFactura` (Zod) ya las validaba, pero al no estar
   * declaradas aquí, Mongoose (`strict` por defecto) las descartaba en
   * silencio en cada `findOneAndUpdate`. Bug real, corregido (Fase Facturas
   * Profesional, auditoría 11/08/2026).
   */
  imagenes: { type: [String], default: [] },
  /** Claves privadas paralelas a `imagenes` (mismo índice) — mismo criterio que `imagenClave`. */
  imagenesClaves: { type: [String], default: [] },
  creado: { type: String, required: true },

  // ── Ampliación documental/fiscal (Fase Facturas Profesional) — todo
  // opcional con default vacío, para no romper ni migrar las facturas ya
  // guardadas con el esquema anterior. ──
  numeroFactura: { type: String, default: '' },
  cifNif: { type: String, default: '' },
  baseImponible: { type: Number },
  /** Impuesto indirecto — depende de la región fiscal de la empresa (Canarias→IGIC, Península→IVA). */
  tipoImpuesto: { type: String, enum: ['igic', 'iva', ''], default: '' },
  porcentajeImpuesto: { type: Number },
  importeImpuesto: { type: Number },
  categoria: { type: String, default: '' },
  /** Proyecto/expediente al que pertenece — desde el incremento "Cliente ≠ Proyecto" (20/08/2026) es la clave real de aislamiento entre trabajos del mismo cliente; `clienteId` se mantiene apuntando a la identidad. */
  proyectoId: { type: String, default: '', index: true },
  /** Relación real al proveedor — `proveedor` (texto) se mantiene como respaldo/compatibilidad con facturas antiguas. */
  proveedorId: { type: String, default: '', index: true },
  /** Cómo entró el documento al sistema. */
  origen: { type: String, enum: ['escaner', 'foto', 'pdf', 'manual', ''], default: '' },
  /** PDF generado a partir de las páginas escaneadas/fotografiadas. */
  pdfUrl: { type: String, default: '' },
  /** PDF original, si la factura se subió directamente como PDF. */
  pdfOriginalUrl: { type: String, default: '' },
  /** Clave privada de `pdfOriginalUrl` — mismo criterio que `imagenClave`. */
  pdfOriginalClave: { type: String, default: '' },
  /** Páginas del documento en orden, con su tipo — sustituye gradualmente a `imagenes` para poder mezclar imagen y PDF en un mismo documento. */
  paginas: {
    type: [{ tipo: { type: String, enum: ['imagen', 'pdf'] }, url: String, clave: { type: String, default: '' } }],
    default: [],
  },
});

/**
 * Índice compuesto para `listarFacturas`, que filtra por `usuarioId` y
 * ordena por `creado` descendente — sin este índice, Mongo debe ordenar
 * los resultados en memoria tras el filtrado.
 */
FacturaSchema.index({ usuarioId: 1, creado: -1 });

/** Modelo Mongoose de Factura. */
export const FacturaModel: Model<any> = models.Factura || model('Factura', FacturaSchema);

/**
 * Gasto periódico o estimado (Fase Facturas Profesional, auditoría fiscal
 * 11/08/2026) — gastos deducibles reales que no llegan como una factura
 * puntual (amortizaciones, cuota de autónomos, suministros de vivienda con
 * uso parcial…). El usuario los introduce con el dato que le confirme su
 * asesor; la app nunca infiere `coeficiente` ni `afectacionExclusiva` por
 * su cuenta — ver `nota` para dejar constancia del origen del dato.
 */
const GastoPeriodicoSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  usuarioId: { type: String, required: true, index: true, default: 'admin' },
  tipo: { type: String, enum: ['amortizacion', 'reta', 'suministro', 'provision', 'otro'], required: true },
  descripcion: { type: String, required: true },
  /** Importe ya calculado a aplicar por periodicidad (p. ej. la cuota mensual de amortización, o la cuota de RETA). */
  importe: { type: Number, required: true },
  periodicidad: { type: String, enum: ['mensual', 'trimestral'], default: 'mensual' },
  // Campos propios de una amortización — tabla de coeficientes AEAT
  // sugerida en el frontend, pero el valor final lo confirma el usuario.
  valorAdquisicion: { type: Number },
  categoriaBien: { type: String, default: '' },
  coeficiente: { type: Number },
  fechaInicio: { type: String, default: '' },
  /**
   * Solo relevante para bienes indivisibles como un vehículo — en IRPF NO
   * existe un % de afectación intermedio (art. 22 RIRPF): o exclusivo
   * (deducible al 100%) o no afecto (no deducible en absoluto). `null`
   * hasta que el usuario lo confirma explícitamente.
   */
  afectacionExclusiva: { type: Boolean, default: null },
  /** P. ej. "según mi asesor, 12/2026" — deja constancia de que el dato no lo generó la app. */
  nota: { type: String, default: '' },
  activo: { type: Boolean, default: true },
  creado: { type: String, required: true },
});
GastoPeriodicoSchema.index({ usuarioId: 1, activo: 1 });

/** Modelo Mongoose de GastoPeriodico. */
export const GastoPeriodicoModel: Model<any> = models.GastoPeriodico || model('GastoPeriodico', GastoPeriodicoSchema);

/**
 * Esquema de un dibujo del módulo profesional de dibujo (Fase 2.1).
 * Colección propia, independiente del cliente — antes los dibujos vivían
 * como subdocumentos dentro de `Proyecto.dibujos[]` (base64 embebido, pizarra
 * antigua, eliminada el 23/08/2026 tras confirmar que no quedaba ningún
 * proyecto real con datos en ese campo). `contenido` es el snapshot
 * vectorial de tldraw: se guarda tal cual devuelve la librería (`Mixed`, sin
 * forma fija) porque su estructura interna no es responsabilidad de este
 * esquema — la valida `esquemaDibujo` en tamaño total, no campo a campo.
 */
const DibujoSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  usuarioId: { type: String, required: true, index: true, default: 'admin' },
  /** Ficha de cliente a la que pertenece — vacío para un dibujo "temporal". */
  clienteId: { type: String, default: '', index: true },
  /** Carpeta del cliente que lo contiene — vacío si aún no se ha archivado. */
  carpetaId: { type: String, default: '', index: true },
  /** Proyecto/expediente al que pertenece (incremento "Cliente ≠ Proyecto", 20/08/2026) — `clienteId` se mantiene apuntando a la identidad. */
  proyectoId: { type: String, default: '', index: true },
  nombre: { type: String, required: true },
  /** URL en almacenamiento externo tras subir el Base64 recibido (Incremento 1.7). */
  miniatura: { type: String, default: '' },
  contenido: { type: Schema.Types.Mixed, default: {} },
  version: { type: Number, default: 1 },
  /** Reservado: aún sin interfaz para gestionarlas. */
  etiquetas: { type: [String], default: [] },
  creadoEn: { type: String, required: true },
  actualizadoEn: { type: String, required: true },
});

/** Consulta principal de la galería: dibujos del usuario, más recientes primero. */
DibujoSchema.index({ usuarioId: 1, actualizadoEn: -1 });
/** Consulta del apartado "Dibujos" de una ficha de cliente concreta. */
DibujoSchema.index({ usuarioId: 1, clienteId: 1, actualizadoEn: -1 });
/** Consulta del contenido de una carpeta concreta. */
DibujoSchema.index({ usuarioId: 1, carpetaId: 1, actualizadoEn: -1 });

/** Modelo Mongoose de Dibujo (módulo profesional de dibujo, Fase 2.1). */
export const DibujoModel: Model<any> = models.Dibujo || model('Dibujo', DibujoSchema);

/**
 * Carpeta de dibujos dentro de la ficha de un cliente (Fase 2.2) — agrupa
 * dibujos como lo haría un carpintero con carpetas físicas de planos
 * ("Cocina", "Armarios", "Exterior"...). Colección propia, agnóstica al
 * tipo de contenido: cuando en el futuro se añadan fotos de obra, PDFs o
 * imágenes generadas por IA, cada una añadirá su propio `carpetaId` sin
 * tener que tocar este esquema.
 */
const CarpetaSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  usuarioId: { type: String, required: true, index: true, default: 'admin' },
  clienteId: { type: String, required: true, index: true },
  /** Proyecto/expediente al que pertenece (incremento "Cliente ≠ Proyecto", 20/08/2026) — `''` en carpetas creadas antes de ese incremento, hasta que pasen por `migracion-proyectos.ts`. */
  proyectoId: { type: String, default: '', index: true },
  nombre: { type: String, required: true },
  creadoEn: { type: String, required: true },
  actualizadoEn: { type: String, required: true },
});

/** Consulta principal: carpetas de un cliente concreto. */
CarpetaSchema.index({ usuarioId: 1, clienteId: 1, actualizadoEn: -1 });
/** No se repiten nombres de carpeta dentro del mismo cliente. */
CarpetaSchema.index({ usuarioId: 1, clienteId: 1, nombre: 1 }, { unique: true });

/** Modelo Mongoose de Carpeta (carpetas de dibujos por cliente, Fase 2.2). */
export const CarpetaModel: Model<any> = models.Carpeta || model('Carpeta', CarpetaSchema);

/**
 * Conecta a MongoDB usando la variable de entorno MONGO_URL.
 * Reutiliza la conexión existente si ya está abierta.
 *
 * Pool acotado explícitamente (auditoría 12/08/2026, alerta real de Atlas
 * "nearing the connection limit" en el clúster M0, límite duro de 500
 * conexiones para todo el clúster): sin esto, el driver de MongoDB usa sus
 * valores por defecto — hasta 100 conexiones concurrentes *por proceso* y
 * sin cerrar nunca las inactivas (`maxIdleTimeMS` sin definir). En este
 * entorno de desarrollo, cuando `bit run --watch` recompila tras un cambio
 * de código a veces deja vivo el proceso backend anterior además del
 * nuevo (huérfano ya documentado varias veces en esta sesión) — cada
 * proceso zombi de esos, sin este límite, podía abrir hasta 100
 * conexiones más por su cuenta. `maxPoolSize: 10` dimensiona esto para lo
 * que de verdad necesita un backend pequeño (nunca decenas de peticiones
 * Mongo concurrentes reales), y `maxIdleTimeMS` hace que las conexiones
 * que ya no se usan se cierren solas en vez de quedarse abiertas para
 * siempre.
 */
export async function conectar(): Promise<void> {
  await conectarMongo();
}
