import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { UsuarioModel, conectarUsuarios } from './usuario.model.js';
import { ClienteModel, ProyectoModel, PresupuestoModel, FacturaModel, DibujoModel, RecursoModel } from './cliente.model.js';
import { ContadorAlmacenamientoModel } from './contador-almacenamiento.model.js';
import { almacenamiento } from './almacenamiento.service.js';
import { tamanoContenidoJson } from './almacenamiento-cuota.js';
import { ejecutarBackfillAlmacenamiento } from './almacenamiento-backfill.js';
import { inicializarMotorDocumental } from './documento-motor-inicializar.js';
import { PAGINA_A4, type DocumentoMC } from './documento-modelo.js';

/**
 * Backfill de cuota de almacenamiento (05/09/2026) — rellena `tamano` en
 * documentos guardados ANTES de que ese campo existiera y recalcula el
 * contador agregado por usuario. Estas pruebas insertan documentos
 * "legado" directamente con el driver de Mongo (`Model.create`, saltando
 * `guardarFactura`/`guardarDibujo`, que YA rellenan `tamano` por sí solos)
 * para simular exactamente lo que hay en producción hoy: documentos reales
 * sin ese campo.
 */

let mongod: MongoMemoryServer;

async function crearUsuario(id: string): Promise<void> {
  await conectarUsuarios();
  await UsuarioModel.create({
    id, nombre: `${id}@example.com`, nombreNormalizado: `${id}@example.com`,
    passwordHash: 'x', hashAlgo: 'bcrypt', estado: 'activo', esAdmin: false, creadoEn: new Date().toISOString(),
  });
}

async function contadorDe(usuarioId: string): Promise<number> {
  const doc = await ContadorAlmacenamientoModel.findOne({ usuarioId }).lean().exec() as any;
  return doc?.bytesUsados ?? 0;
}

/**
 * Inserta un documento SALTÁNDOSE Mongoose por completo
 * (`Model.collection.insertOne`, el driver nativo) — a propósito, para
 * simular de verdad un documento "legado" tal como existe en producción
 * hoy: uno guardado ANTES de que el campo `*Tamano` existiera en el
 * esquema, con esa clave completamente AUSENTE del BSON.
 *
 * `Model.create(...)` NO sirve para esto: Mongoose aplica los `default`
 * del esquema (`{type:Number, default:0}`) al construir el documento y
 * los persiste de verdad — un documento creado así ya tendría
 * `imagenTamano: 0` en la base de datos, indistinguible de "ya
 * calculado", y el backfill (que decide qué rellenar mirando `== null`)
 * lo saltaría sin tocar nada, dando estos tests un falso negativo.
 */
async function insertarLegado(model: any, datos: Record<string, unknown>): Promise<void> {
  await model.collection.insertOne(datos);
}

function documentoConElementos(elementos: unknown[]): DocumentoMC {
  return {
    id: 'doc-backfill-1', schemaVersion: 1, documentoBaseId: null, etiquetaVersion: null, documentVersion: 1,
    plantillaOrigen: null,
    paginas: [{ id: 'pag-1', indice: 0, nombre: '', configuracion: null, fondo: null, encabezado: null, pie: null, numeracion: { mostrar: false, formato: '', posicion: 'centro' }, elementos: elementos as any }],
    configuracionPorDefecto: { ancho: PAGINA_A4.ancho, alto: PAGINA_A4.alto, orientacion: 'vertical', margenes: { arriba: 0, abajo: 0, izquierda: 0, derecha: 0 } },
    fondoPorDefecto: { tipo: 'ninguno' }, encabezadoPorDefecto: null, piePorDefecto: null,
    variables: { claves: {} }, configuracionImpresion: { sangrado: 0, escala: 1 }, tema: null, estilosGuardados: [],
  };
}

function elementoImagen(id: string, url: string, claveAlmacenamiento?: string) {
  return {
    id, tipo: 'imagen', posicion: { x: 0, y: 0 }, tamano: { ancho: 10, alto: 10 },
    contenido: { url, claveAlmacenamiento, recorte: null }, propiedadesEspecificas: { bordeRadio: 0 }, estilo: {},
  };
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URL = mongod.getUri();
  await mongoose.connect(process.env.MONGO_URL);
  inicializarMotorDocumental();
}, 60_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await Promise.all([
    UsuarioModel.deleteMany({}), ClienteModel.deleteMany({}), ProyectoModel.deleteMany({}),
    PresupuestoModel.deleteMany({}), FacturaModel.deleteMany({}), DibujoModel.deleteMany({}),
    RecursoModel.deleteMany({}), ContadorAlmacenamientoModel.deleteMany({}),
  ]);
});

describe('ejecutarBackfillAlmacenamiento — facturas legado', () => {
  it('calcula el tamaño real (HeadObject/en memoria) de una imagen legado sin tamano guardado, sin descargar ni modificar el archivo', async () => {
    await crearUsuario('u-backfill-factura');
    const subida = await almacenamiento.subir(Buffer.alloc(777, 3), { contentType: 'image/jpeg', carpeta: 'facturas' });
    await insertarLegado(FacturaModel, {
      id: 'f-legado-1', usuarioId: 'u-backfill-factura', tipo: 'gasto', fecha: '2026-01-01', importe: 10,
      concepto: 'x', proveedor: '', clienteId: '', imagen: subida.url, imagenClave: subida.clave, imagenes: [],
      creado: new Date().toISOString(),
      // Sin imagenTamano/pdfOriginalTamano/imagenesTamanos — como una factura real de antes de esta función.
    });

    const resumen = await ejecutarBackfillAlmacenamiento();
    expect(resumen.facturasActualizadas).toBe(1);

    const doc = await FacturaModel.findOne({ id: 'f-legado-1' }).lean().exec() as any;
    expect(doc.imagenTamano).toBe(777);
    // El archivo en sí sigue intacto — el backfill nunca lo toca.
    const archivo = await almacenamiento.obtener(subida.clave);
    expect(archivo?.datos.length).toBe(777);
  });

  it('una factura sin ninguna imagen queda a 0, no falla ni la marca como pendiente de revisión', async () => {
    await crearUsuario('u-backfill-sin-imagen');
    await FacturaModel.create({
      id: 'f-legado-2', usuarioId: 'u-backfill-sin-imagen', tipo: 'gasto', fecha: '2026-01-01', importe: 10,
      concepto: 'x', proveedor: '', clienteId: '', imagen: '', imagenes: [], creado: new Date().toISOString(),
    });
    const resumen = await ejecutarBackfillAlmacenamiento();
    const doc = await FacturaModel.findOne({ id: 'f-legado-2' }).lean().exec() as any;
    expect(doc.imagenTamano).toBe(0);
    expect(resumen.pendientesRevisionManual.some((p) => p.includes('f-legado-2'))).toBe(false);
  });

  it('una URL externa/legada (de otro dominio) no se puede medir: queda en 0 y se anota para revisión manual, sin lanzar', async () => {
    await crearUsuario('u-backfill-externa');
    await insertarLegado(FacturaModel, {
      id: 'f-legado-3', usuarioId: 'u-backfill-externa', tipo: 'gasto', fecha: '2026-01-01', importe: 10,
      concepto: 'x', proveedor: '', clienteId: '', imagen: 'https://cdn.externo.example/foto.jpg', imagenes: [],
      creado: new Date().toISOString(),
    });
    const resumen = await ejecutarBackfillAlmacenamiento();
    const doc = await FacturaModel.findOne({ id: 'f-legado-3' }).lean().exec() as any;
    expect(doc.imagenTamano).toBe(0);
    expect(resumen.pendientesRevisionManual.some((p) => p.includes('f-legado-3'))).toBe(true);
  });

  it('no vuelve a tocar una factura que YA tiene tamano calculado (ni con el valor correcto ni con un 0 legítimo)', async () => {
    await crearUsuario('u-backfill-ya-hecho');
    await FacturaModel.create({
      id: 'f-ya-hecho', usuarioId: 'u-backfill-ya-hecho', tipo: 'gasto', fecha: '2026-01-01', importe: 10,
      concepto: 'x', proveedor: '', clienteId: '', imagen: '', imagenTamano: 0, imagenes: [], creado: new Date().toISOString(),
    });
    const resumen = await ejecutarBackfillAlmacenamiento();
    expect(resumen.facturasActualizadas).toBe(0); // nada que rellenar
  });
});

describe('ejecutarBackfillAlmacenamiento — dibujos legado', () => {
  it('calcula miniaturaTamano (almacenamiento real) y contenidoTamano (tamaño del JSON, sin tocar el almacenamiento)', async () => {
    await crearUsuario('u-backfill-dibujo');
    const subida = await almacenamiento.subir(Buffer.alloc(200, 1), { contentType: 'image/png', carpeta: 'dibujos-miniaturas' });
    const contenido = { elements: [{ type: 'freedraw' }, { type: 'text', text: 'Medida: 3.2m' }] };
    await insertarLegado(DibujoModel, {
      id: 'd-legado-1', usuarioId: 'u-backfill-dibujo', clienteId: '', proyectoId: '', carpetaId: '', nombre: 'Boceto',
      miniatura: subida.url, contenido, version: 1, etiquetas: [],
      creadoEn: new Date().toISOString(), actualizadoEn: new Date().toISOString(),
    });

    const resumen = await ejecutarBackfillAlmacenamiento();
    expect(resumen.dibujosActualizados).toBe(1);

    const doc = await DibujoModel.findOne({ id: 'd-legado-1' }).lean().exec() as any;
    expect(doc.miniaturaTamano).toBe(200);
    expect(doc.contenidoTamano).toBe(tamanoContenidoJson(contenido));
    // El contenido en sí no se ha tocado.
    expect(doc.contenido).toEqual(contenido);
  });
});

describe('ejecutarBackfillAlmacenamiento — recursos embebidos del Motor Documental', () => {
  it('rellena tamano en una imagen embebida de un presupuesto formato:"documento" guardado antes de esta función', async () => {
    await crearUsuario('u-backfill-documento');
    await ClienteModel.create({ id: 'c-backfill-doc', usuarioId: 'u-backfill-documento', nombre: 'Cliente', creado: new Date().toISOString() });
    const subida = await almacenamiento.subir(Buffer.alloc(444, 2), { contentType: 'image/png', carpeta: 'documentos' });
    const documento = documentoConElementos([elementoImagen('img-1', subida.url, subida.clave)]);
    await PresupuestoModel.create({
      id: 'pr-backfill-1', usuarioId: 'u-backfill-documento', clienteId: 'c-backfill-doc', titulo: 'x',
      formato: 'documento', precioTotal: 100, contenidoDocumento: documento,
      creado: new Date().toISOString(), actualizado: new Date().toISOString(),
    });

    const resumen = await ejecutarBackfillAlmacenamiento();
    expect(resumen.presupuestosActualizados).toBe(1);

    const doc = await PresupuestoModel.findOne({ id: 'pr-backfill-1' }).lean().exec() as any;
    const elemento = doc.contenidoDocumento.paginas[0].elementos[0];
    expect(elemento.contenido.tamano).toBe(444);
  });
});

describe('ejecutarBackfillAlmacenamiento — contador agregado', () => {
  it('recalcula el contador de un usuario sumando fotos/adjuntos, factura y dibujo, aislado de otros usuarios', async () => {
    await crearUsuario('u-backfill-agregado-a');
    await crearUsuario('u-backfill-agregado-b');

    await ClienteModel.create({ id: 'c-agregado-a', usuarioId: 'u-backfill-agregado-a', nombre: 'Cliente A', creado: new Date().toISOString() });
    await ProyectoModel.create({
      id: 'p-agregado-a', usuarioId: 'u-backfill-agregado-a', clienteId: 'c-agregado-a', tarifaHora: 20, creado: new Date().toISOString(),
      fotos: [{ id: 'f1', url: 'x', fecha: '2026-01-01', tamano: 100 }],
      adjuntos: [{ id: 'a1', nombre: 'x.pdf', tipo: 'application/pdf', url: 'x', tamano: 50 }],
    });
    await FacturaModel.create({
      id: 'f-agregado-a', usuarioId: 'u-backfill-agregado-a', tipo: 'gasto', fecha: '2026-01-01', importe: 1,
      concepto: 'x', proveedor: '', clienteId: '', imagen: '', imagenTamano: 30, imagenes: [], creado: new Date().toISOString(),
    });

    // Usuario B, con su propio dato — nunca debe mezclarse con A.
    await FacturaModel.create({
      id: 'f-agregado-b', usuarioId: 'u-backfill-agregado-b', tipo: 'gasto', fecha: '2026-01-01', importe: 1,
      concepto: 'x', proveedor: '', clienteId: '', imagen: '', imagenTamano: 9999, imagenes: [], creado: new Date().toISOString(),
    });

    await ejecutarBackfillAlmacenamiento();

    expect(await contadorDe('u-backfill-agregado-a')).toBe(100 + 50 + 30);
    expect(await contadorDe('u-backfill-agregado-b')).toBe(9999);
  });

  it('idempotente: ejecutarlo dos veces seguidas da exactamente el mismo resultado, sin duplicar nada', async () => {
    await crearUsuario('u-backfill-idempotente');
    await FacturaModel.create({
      id: 'f-idempotente', usuarioId: 'u-backfill-idempotente', tipo: 'gasto', fecha: '2026-01-01', importe: 1,
      concepto: 'x', proveedor: '', clienteId: '', imagen: '', imagenes: [], creado: new Date().toISOString(),
    });

    const r1 = await ejecutarBackfillAlmacenamiento();
    const totalTrasPrimera = await contadorDe('u-backfill-idempotente');
    const r2 = await ejecutarBackfillAlmacenamiento();
    const totalTrasSegunda = await contadorDe('u-backfill-idempotente');

    expect(totalTrasSegunda).toBe(totalTrasPrimera);
    expect(r2.facturasActualizadas).toBe(0); // ya no queda ningún tamano por rellenar
    void r1;
  });
});
