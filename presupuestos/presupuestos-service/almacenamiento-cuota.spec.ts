import { vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { UsuarioModel, conectarUsuarios } from './usuario.model.js';
import {
  ClienteModel, ProyectoModel, PresupuestoModel, FacturaModel, DibujoModel, RecursoModel, conectar,
} from './cliente.model.js';
import { ContadorAlmacenamientoModel } from './contador-almacenamiento.model.js';
import { EnlacePresupuestoModel } from './enlace-presupuesto.model.js';
import { PresupuestosService } from './presupuestos-service.js';
import { almacenamiento } from './almacenamiento.service.js';
import {
  LIMITES_ALMACENAMIENTO_BYTES, limiteAlmacenamientoBytes, ErrorCuotaAlmacenamientoSuperada,
  reclamarEspacioAlmacenamiento, reclamarEspacioParaSustitucion, liberarEspacioAlmacenamiento,
  obtenerUsoAlmacenamiento, tamanoContenidoJson,
} from './almacenamiento-cuota.js';
import { inicializarMotorDocumental } from './documento-motor-inicializar.js';
import { PAGINA_A4, type DocumentoMC } from './documento-modelo.js';

/**
 * Cuota de almacenamiento por plan (05/09/2026) — encargo del usuario:
 * BASIC 5 GB, PRO 25 GB, PREMIUM 100 GB, ADMIN sin límite. Estas pruebas
 * ejercitan la MISMA función que usan las rutas reales
 * (`reclamarEspacioAlmacenamiento`/`guardarFactura`/`guardarDibujo`/...),
 * nunca una reimplementación paralela para el test (mismo criterio que
 * `numeracion-presupuestos.spec.ts`/`planes.spec.ts`).
 *
 * La mayoría de las pruebas de límite usan `reclamarEspacioAlmacenamiento`
 * directamente con números literales — no hace falta generar ni subir
 * buffers de gigabytes de verdad: la función solo recibe `bytes: number`,
 * nunca lee el archivo en sí, así que un test de "justo en el límite de
 * BASIC" es instantáneo y determinista sin ocupar memoria real.
 */

let mongod: MongoMemoryServer;
const svc = PresupuestosService.from();

async function crearUsuarioConPlan(id: string, plan: string | null): Promise<void> {
  await conectarUsuarios();
  await UsuarioModel.create({
    id,
    nombre: `${id}@example.com`,
    nombreNormalizado: `${id}@example.com`,
    passwordHash: 'x',
    hashAlgo: 'bcrypt',
    estado: 'activo',
    esAdmin: false,
    creadoEn: new Date().toISOString(),
    ...(plan ? { acceso: { tipo: 'paid', plan, activadoEn: null, expiraEn: null, origen: 'admin', codigoUsado: null } } : {}),
  });
}

async function contadorDe(usuarioId: string): Promise<number> {
  await conectar();
  const doc = await ContadorAlmacenamientoModel.findOne({ usuarioId }).lean().exec() as any;
  return doc?.bytesUsados ?? 0;
}

/** Data URL de un archivo de mentira — el contenido no importa, solo que decodifique al tamaño pedido (mismo criterio que `modelo3d-archivo.spec.ts`). */
function dataUrlDeTamano(bytes: number, mime = 'application/octet-stream'): string {
  return `data:${mime};base64,${Buffer.alloc(bytes, 1).toString('base64')}`;
}

const PIXEL_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const PNG_DATA_URL = `data:image/png;base64,${PIXEL_PNG_B64}`;

function elementoImagen(id: string, url: string) {
  return {
    id, tipo: 'imagen', posicion: { x: 0, y: 0 }, tamano: { ancho: 10, alto: 10 },
    contenido: { url, recorte: null }, propiedadesEspecificas: { bordeRadio: 0 }, estilo: {},
  };
}

function documentoConElementos(elementos: unknown[]): DocumentoMC {
  return {
    id: 'doc-cuota-1', schemaVersion: 1, documentoBaseId: null, etiquetaVersion: null, documentVersion: 1,
    plantillaOrigen: null,
    paginas: [{ id: 'pag-1', indice: 0, nombre: '', configuracion: null, fondo: null, encabezado: null, pie: null, numeracion: { mostrar: false, formato: '', posicion: 'centro' }, elementos: elementos as any }],
    configuracionPorDefecto: { ancho: PAGINA_A4.ancho, alto: PAGINA_A4.alto, orientacion: 'vertical', margenes: { arriba: 0, abajo: 0, izquierda: 0, derecha: 0 } },
    fondoPorDefecto: { tipo: 'ninguno' }, encabezadoPorDefecto: null, piePorDefecto: null,
    variables: { claves: {} }, configuracionImpresion: { sangrado: 0, escala: 1 }, tema: null, estilosGuardados: [],
  };
}

async function crearClienteYProyecto(id: string, usuarioId: string) {
  await ClienteModel.create({ id: `cliente-${id}`, usuarioId, nombre: 'Cliente de prueba', creado: new Date().toISOString() });
  await ProyectoModel.create({ id, usuarioId, clienteId: `cliente-${id}`, tarifaHora: 20, creado: new Date().toISOString() });
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
    RecursoModel.deleteMany({}), ContadorAlmacenamientoModel.deleteMany({}), EnlacePresupuestoModel.deleteMany({}),
  ]);
});

// ── Límites por plan — la fuente de verdad son los propios literales exportados ──
describe('límites por plan (decisión definitiva: 5/25/100 GB)', () => {
  it('BASIC = 5 GiB, PRO = 25 GiB, PREMIUM = 100 GiB', () => {
    expect(LIMITES_ALMACENAMIENTO_BYTES.BASIC).toBe(5 * 1024 ** 3);
    expect(LIMITES_ALMACENAMIENTO_BYTES.PRO).toBe(25 * 1024 ** 3);
    expect(LIMITES_ALMACENAMIENTO_BYTES.PREMIUM).toBe(100 * 1024 ** 3);
  });
  it('limiteAlmacenamientoBytes trata NONE/LIFETIME_FREE como BASIC (decisión señalada en el informe)', () => {
    expect(limiteAlmacenamientoBytes('NONE')).toBe(LIMITES_ALMACENAMIENTO_BYTES.BASIC);
    expect(limiteAlmacenamientoBytes('LIFETIME_FREE')).toBe(LIMITES_ALMACENAMIENTO_BYTES.BASIC);
  });
});

// ── reclamarEspacioAlmacenamiento — mecanismo atómico ──────────────────────
describe('reclamarEspacioAlmacenamiento', () => {
  it('una subida que cabe dentro del límite se acepta y suma al contador', async () => {
    await reclamarEspacioAlmacenamiento('u-cabe', 1000, 'BASIC');
    expect(await contadorDe('u-cabe')).toBe(1000);
  });

  it('una subida que supera el límite de BASIC se rechaza con ErrorCuotaAlmacenamientoSuperada, y el contador NO queda incrementado (revierte)', async () => {
    const limite = LIMITES_ALMACENAMIENTO_BYTES.BASIC;
    await reclamarEspacioAlmacenamiento('u-excede', limite - 100, 'BASIC'); // deja solo 100 libres
    await expect(reclamarEspacioAlmacenamiento('u-excede', 200, 'BASIC')).rejects.toThrow(ErrorCuotaAlmacenamientoSuperada);
    expect(await contadorDe('u-excede')).toBe(limite - 100); // ni un byte de la subida rechazada quedó contado
  });

  it('una subida que deja el contador EXACTAMENTE en el límite se acepta (el límite es inclusive)', async () => {
    const limite = LIMITES_ALMACENAMIENTO_BYTES.BASIC;
    await reclamarEspacioAlmacenamiento('u-justo', limite - 500, 'BASIC');
    await reclamarEspacioAlmacenamiento('u-justo', 500, 'BASIC'); // total == límite exacto
    expect(await contadorDe('u-justo')).toBe(limite);
  });

  it('un solo byte más allá del límite exacto ya se rechaza', async () => {
    const limite = LIMITES_ALMACENAMIENTO_BYTES.BASIC;
    await reclamarEspacioAlmacenamiento('u-justo-mas-uno', limite, 'BASIC');
    await expect(reclamarEspacioAlmacenamiento('u-justo-mas-uno', 1, 'BASIC')).rejects.toThrow(ErrorCuotaAlmacenamientoSuperada);
    expect(await contadorDe('u-justo-mas-uno')).toBe(limite);
  });

  it('PRO permite hasta 25 GiB — una subida que superaría BASIC pero no PRO se acepta', async () => {
    const bytes = LIMITES_ALMACENAMIENTO_BYTES.BASIC + 1024; // por encima de BASIC, muy por debajo de PRO
    await reclamarEspacioAlmacenamiento('u-pro', bytes, 'PRO');
    expect(await contadorDe('u-pro')).toBe(bytes);
  });

  it('PRO rechaza al superar 25 GiB', async () => {
    const limite = LIMITES_ALMACENAMIENTO_BYTES.PRO;
    await reclamarEspacioAlmacenamiento('u-pro-excede', limite, 'PRO');
    await expect(reclamarEspacioAlmacenamiento('u-pro-excede', 1, 'PRO')).rejects.toThrow(ErrorCuotaAlmacenamientoSuperada);
  });

  it('PREMIUM permite hasta 100 GiB — una subida que superaría PRO pero no PREMIUM se acepta', async () => {
    const bytes = LIMITES_ALMACENAMIENTO_BYTES.PRO + 1024;
    await reclamarEspacioAlmacenamiento('u-premium', bytes, 'PREMIUM');
    expect(await contadorDe('u-premium')).toBe(bytes);
  });

  it('PREMIUM rechaza al superar 100 GiB', async () => {
    const limite = LIMITES_ALMACENAMIENTO_BYTES.PREMIUM;
    await reclamarEspacioAlmacenamiento('u-premium-excede', limite, 'PREMIUM');
    await expect(reclamarEspacioAlmacenamiento('u-premium-excede', 1, 'PREMIUM')).rejects.toThrow(ErrorCuotaAlmacenamientoSuperada);
  });

  it('ADMIN nunca se rechaza, tenga el plan que tenga registrado, y su contador sigue siendo real (no se miente sobre su uso)', async () => {
    const muyPorEncima = LIMITES_ALMACENAMIENTO_BYTES.PREMIUM * 3;
    await expect(reclamarEspacioAlmacenamiento('admin', muyPorEncima, 'BASIC')).resolves.not.toThrow();
    expect(await contadorDe('admin')).toBe(muyPorEncima);
  });

  it('aislamiento: el consumo de un usuario nunca afecta el límite disponible de otro', async () => {
    await reclamarEspacioAlmacenamiento('u-aislado-a', LIMITES_ALMACENAMIENTO_BYTES.BASIC, 'BASIC'); // A al límite
    // B, plan BASIC también, debe poder seguir subiendo con normalidad.
    await expect(reclamarEspacioAlmacenamiento('u-aislado-b', 1000, 'BASIC')).resolves.not.toThrow();
    expect(await contadorDe('u-aislado-b')).toBe(1000);
  });

  it('0 o menos bytes es un no-op (nunca toca el contador ni lanza)', async () => {
    await expect(reclamarEspacioAlmacenamiento('u-cero', 0, 'BASIC')).resolves.not.toThrow();
    expect(await contadorDe('u-cero')).toBe(0);
  });
});

// ── Concurrencia — nunca "leer, comparar, subir, incrementar" ─────────────
describe('reclamarEspacioAlmacenamiento — concurrencia', () => {
  it('varias reclamaciones simultáneas que en total superan el límite: solo entran las que caben, el contador final nunca supera el límite', async () => {
    const limite = LIMITES_ALMACENAMIENTO_BYTES.BASIC;
    const porcion = limite / 4; // 4 caben exactas; a partir de la 5ª ya no
    const resultados = await Promise.allSettled(
      Array.from({ length: 8 }, () => reclamarEspacioAlmacenamiento('u-concurrencia-cuota', porcion, 'BASIC'))
    );
    const aceptadas = resultados.filter((r) => r.status === 'fulfilled').length;
    const rechazadas = resultados.filter((r) => r.status === 'rejected').length;
    expect(aceptadas).toBe(4);
    expect(rechazadas).toBe(4);
    const total = await contadorDe('u-concurrencia-cuota');
    expect(total).toBeLessThanOrEqual(limite);
    expect(total).toBe(limite); // las 4 que caben ocupan el límite exacto, ni una más ni una menos
  });
});

// ── reclamarEspacioParaSustitucion — reemplazo sin doble contabilidad ─────
describe('reclamarEspacioParaSustitucion', () => {
  it('reemplazar por un archivo más PEQUEÑO libera la diferencia, nunca rechaza', async () => {
    await reclamarEspacioAlmacenamiento('u-sustituir-chico', 1000, 'BASIC');
    await reclamarEspacioParaSustitucion('u-sustituir-chico', 'BASIC', 400, 1000);
    expect(await contadorDe('u-sustituir-chico')).toBe(400);
  });

  it('reemplazar por un archivo más GRANDE solo reclama la diferencia (delta), no el tamaño nuevo completo', async () => {
    await reclamarEspacioAlmacenamiento('u-sustituir-grande', 1000, 'BASIC');
    await reclamarEspacioParaSustitucion('u-sustituir-grande', 'BASIC', 1500, 1000);
    expect(await contadorDe('u-sustituir-grande')).toBe(1500); // no 1000+1500
  });

  it('un reemplazo cuya diferencia no cabe se rechaza, dejando el tamaño ANTERIOR intacto (nunca se pierde el archivo viejo por error)', async () => {
    const limite = LIMITES_ALMACENAMIENTO_BYTES.BASIC;
    await reclamarEspacioAlmacenamiento('u-sustituir-sin-sitio', limite - 100, 'BASIC');
    await expect(reclamarEspacioParaSustitucion('u-sustituir-sin-sitio', 'BASIC', limite + 900, 100)).rejects.toThrow(ErrorCuotaAlmacenamientoSuperada);
    expect(await contadorDe('u-sustituir-sin-sitio')).toBe(limite - 100);
  });

  it('tamanoAntiguo = 0 se comporta exactamente como una reclamación nueva', async () => {
    await reclamarEspacioParaSustitucion('u-sustituir-nuevo', 'BASIC', 777, 0);
    expect(await contadorDe('u-sustituir-nuevo')).toBe(777);
  });
});

// ── liberarEspacioAlmacenamiento ──────────────────────────────────────────
describe('liberarEspacioAlmacenamiento', () => {
  it('borrar un archivo libera sus bytes del contador', async () => {
    await reclamarEspacioAlmacenamiento('u-liberar', 5000, 'BASIC');
    await liberarEspacioAlmacenamiento('u-liberar', 3000);
    expect(await contadorDe('u-liberar')).toBe(2000);
  });

  it('nunca deja el contador negativo en la lectura, aunque se libere de más por error defensivo', async () => {
    await reclamarEspacioAlmacenamiento('u-liberar-de-mas', 100, 'BASIC');
    await liberarEspacioAlmacenamiento('u-liberar-de-mas', 500);
    const uso = await obtenerUsoAlmacenamiento('u-liberar-de-mas', 'BASIC');
    expect(uso.bytesUsados).toBe(0); // Math.max(0, ...) en la lectura
  });
});

// ── obtenerUsoAlmacenamiento — GET /almacenamiento/uso ────────────────────
describe('obtenerUsoAlmacenamiento', () => {
  it('devuelve bytesUsados, límite, plan y porcentaje correctos para una cuenta BASIC a mitad de uso', async () => {
    await reclamarEspacioAlmacenamiento('u-uso-basic', LIMITES_ALMACENAMIENTO_BYTES.BASIC / 2, 'BASIC');
    const uso = await obtenerUsoAlmacenamiento('u-uso-basic', 'BASIC');
    expect(uso.plan).toBe('BASIC');
    expect(uso.limiteBytes).toBe(LIMITES_ALMACENAMIENTO_BYTES.BASIC);
    expect(uso.porcentaje).toBeCloseTo(50, 1);
    expect(uso.estado).toBe('normal');
    expect(uso.ilimitado).toBe(false);
  });

  it('estado "aviso" a partir del 90% de uso', async () => {
    await reclamarEspacioAlmacenamiento('u-uso-aviso', Math.floor(LIMITES_ALMACENAMIENTO_BYTES.BASIC * 0.95), 'BASIC');
    const uso = await obtenerUsoAlmacenamiento('u-uso-aviso', 'BASIC');
    expect(uso.estado).toBe('aviso');
  });

  it('estado "lleno" al 100% de uso', async () => {
    await reclamarEspacioAlmacenamiento('u-uso-lleno', LIMITES_ALMACENAMIENTO_BYTES.BASIC, 'BASIC');
    const uso = await obtenerUsoAlmacenamiento('u-uso-lleno', 'BASIC');
    expect(uso.estado).toBe('lleno');
    expect(uso.porcentaje).toBe(100);
  });

  it('una cuenta sin ningún archivo subido nunca da error, devuelve 0 bytes usados', async () => {
    const uso = await obtenerUsoAlmacenamiento('u-uso-vacio', 'PRO');
    expect(uso.bytesUsados).toBe(0);
    expect(uso.estado).toBe('normal');
  });

  it('ADMIN se muestra como ilimitado (límite Infinity, 0%), aunque su bytesUsados real siga siendo correcto', async () => {
    await reclamarEspacioAlmacenamiento('admin', 999_999, 'BASIC');
    const uso = await obtenerUsoAlmacenamiento('admin', 'BASIC');
    expect(uso.ilimitado).toBe(true);
    expect(uso.limiteBytes).toBe(Infinity);
    expect(uso.porcentaje).toBe(0);
    expect(uso.bytesUsados).toBe(999_999); // el número real, no ocultado
  });
});

// ── Downgrade de plan — nunca se borra nada, solo se bloquean subidas NUEVAS ──
describe('Downgrade de plan (PRO/PREMIUM → BASIC) — nunca borra, solo bloquea subidas nuevas hasta liberar espacio', () => {
  it('una cuenta con más uso del que permite su plan NUEVO no puede reclamar ni un byte más', async () => {
    // Simula una cuenta que subió 10 GiB siendo PRO y baja a BASIC (5 GiB).
    const usoPrevio = 10 * 1024 ** 3;
    await reclamarEspacioAlmacenamiento('u-downgrade', usoPrevio, 'PRO');
    await expect(reclamarEspacioAlmacenamiento('u-downgrade', 1, 'BASIC')).rejects.toThrow(ErrorCuotaAlmacenamientoSuperada);
    // El uso ya existente NUNCA se toca ni se borra por el simple hecho de rechazar la subida nueva.
    expect(await contadorDe('u-downgrade')).toBe(usoPrevio);
  });

  it('tras liberar espacio suficiente (borrando archivos), la cuenta puede volver a subir con normalidad', async () => {
    const usoPrevio = 10 * 1024 ** 3;
    await reclamarEspacioAlmacenamiento('u-downgrade-recupera', usoPrevio, 'PRO');
    await expect(reclamarEspacioAlmacenamiento('u-downgrade-recupera', 1, 'BASIC')).rejects.toThrow();

    await liberarEspacioAlmacenamiento('u-downgrade-recupera', 6 * 1024 ** 3); // ahora quedan 4 GiB usados, por debajo de los 5 GiB de BASIC
    await expect(reclamarEspacioAlmacenamiento('u-downgrade-recupera', 1000, 'BASIC')).resolves.not.toThrow();
  });
});

// ── tamanoContenidoJson — Dibujo.contenido, que nunca sube a R2 ───────────
describe('tamanoContenidoJson', () => {
  it('mide el tamaño real en bytes UTF-8 del JSON, no el número de caracteres de un objeto JS', () => {
    const conTilde = { texto: 'áéíóú' }; // cada tilde ocupa 2 bytes en UTF-8, no 1
    const tamano = tamanoContenidoJson(conTilde);
    expect(tamano).toBe(Buffer.byteLength(JSON.stringify(conTilde), 'utf8'));
    expect(tamano).toBeGreaterThan(JSON.stringify(conTilde).length);
  });
  it('un contenido null/undefined mide el tamaño de "null", nunca lanza', () => {
    expect(tamanoContenidoJson(null)).toBe(Buffer.byteLength('null', 'utf8'));
    expect(tamanoContenidoJson(undefined)).toBe(Buffer.byteLength('null', 'utf8'));
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Integración real — los 9 puntos de subida cubiertos por el encargo
// ═══════════════════════════════════════════════════════════════════════

describe('Integración — fotos/adjuntos de proyecto (guardarProyecto, PUT /proyectos/:id)', () => {
  it('subir una foto nueva incrementa el contador del usuario en su tamaño real', async () => {
    await crearUsuarioConPlan('u-fotos', 'BASIC');
    await crearClienteYProyecto('p-fotos', 'u-fotos');
    await svc.guardarProyecto({ id: 'p-fotos', clienteId: 'cliente-p-fotos', fotos: [{ id: 'f1', url: dataUrlDeTamano(500, 'image/png') }] } as any, 'u-fotos');
    expect(await contadorDe('u-fotos')).toBe(500);
  });

  it('borrar el proyecto entero libera el espacio de sus fotos y adjuntos', async () => {
    await crearUsuarioConPlan('u-fotos-borrar', 'BASIC');
    await crearClienteYProyecto('p-fotos-borrar', 'u-fotos-borrar');
    await svc.guardarProyecto({
      id: 'p-fotos-borrar', clienteId: 'cliente-p-fotos-borrar',
      fotos: [{ id: 'f1', url: dataUrlDeTamano(300, 'image/png') }],
      adjuntos: [{ id: 'a1', url: dataUrlDeTamano(200, 'application/pdf') }],
    } as any, 'u-fotos-borrar');
    expect(await contadorDe('u-fotos-borrar')).toBe(500);
    await svc.borrarProyecto('p-fotos-borrar', 'u-fotos-borrar');
    expect(await contadorDe('u-fotos-borrar')).toBe(0);
  });

  it('quitar una foto (sigue habiendo otras) libera solo el espacio de la que se quitó', async () => {
    await crearUsuarioConPlan('u-fotos-parcial', 'BASIC');
    await crearClienteYProyecto('p-fotos-parcial', 'u-fotos-parcial');
    const guardado1 = await svc.guardarProyecto({
      id: 'p-fotos-parcial', clienteId: 'cliente-p-fotos-parcial',
      fotos: [{ id: 'f1', url: dataUrlDeTamano(300, 'image/png') }, { id: 'f2', url: dataUrlDeTamano(400, 'image/png') }],
    } as any, 'u-fotos-parcial');
    expect(await contadorDe('u-fotos-parcial')).toBe(700);
    const f2YaSubida = (guardado1 as any).fotos.find((f: any) => f.id === 'f2'); // ya tiene una URL externa real, no base64
    await svc.guardarProyecto({
      id: 'p-fotos-parcial', clienteId: 'cliente-p-fotos-parcial',
      fotos: [f2YaSubida], // f1 ya no está; f2 se reenvía tal cual (ya subida), no como base64 nuevo
    } as any, 'u-fotos-parcial');
    // Solo se liberan los 300 de f1 — f2 no se vuelve a contar (no era una subida nueva).
    expect(await contadorDe('u-fotos-parcial')).toBe(400);
  });

  it('un adjunto que supera lo que le queda de cuota se rechaza y no deja ningún archivo huérfano', async () => {
    await crearUsuarioConPlan('u-adjunto-excede', 'BASIC');
    await crearClienteYProyecto('p-adjunto-excede', 'u-adjunto-excede');
    await ContadorAlmacenamientoModel.create({ usuarioId: 'u-adjunto-excede', bytesUsados: LIMITES_ALMACENAMIENTO_BYTES.BASIC - 50 });
    await expect(
      svc.anadirAdjuntoProyecto('p-adjunto-excede', 'u-adjunto-excede', { id: 'a1', nombre: 'x.pdf', tipo: 'application/pdf', tamano: 200, url: dataUrlDeTamano(200, 'application/pdf') })
    ).rejects.toThrow(ErrorCuotaAlmacenamientoSuperada);
    expect(await contadorDe('u-adjunto-excede')).toBe(LIMITES_ALMACENAMIENTO_BYTES.BASIC - 50); // nunca se incrementó
    const doc = await ProyectoModel.findOne({ id: 'p-adjunto-excede' }).lean().exec() as any;
    expect(doc.adjuntos ?? []).toEqual([]); // tampoco se persistió ninguna referencia a medias
  });
});

describe('Integración — facturas (guardarFactura/borrarFactura, PUT /facturas/:id)', () => {
  it('subir la imagen de una factura incrementa el contador; borrarla lo libera', async () => {
    await crearUsuarioConPlan('u-factura', 'BASIC');
    await svc.guardarFactura({
      id: 'f-cuota-1', tipo: 'gasto', fecha: '2026-09-01', importe: 100, concepto: 'Material',
      proveedor: '', clienteId: '', imagen: dataUrlDeTamano(1000, 'image/jpeg'), imagenes: [],
      creado: new Date().toISOString(),
    } as any, 'u-factura');
    expect(await contadorDe('u-factura')).toBe(1000);
    await svc.borrarFactura('f-cuota-1', 'u-factura');
    expect(await contadorDe('u-factura')).toBe(0);
  });

  it('reemplazar la imagen de una factura por otra no acumula el tamaño de ambas — solo queda la nueva', async () => {
    await crearUsuarioConPlan('u-factura-reemplazo', 'BASIC');
    await svc.guardarFactura({
      id: 'f-cuota-2', tipo: 'gasto', fecha: '2026-09-01', importe: 100, concepto: 'Material',
      proveedor: '', clienteId: '', imagen: dataUrlDeTamano(1000, 'image/jpeg'), imagenes: [],
      creado: new Date().toISOString(),
    } as any, 'u-factura-reemplazo');
    await svc.guardarFactura({
      id: 'f-cuota-2', tipo: 'gasto', fecha: '2026-09-01', importe: 100, concepto: 'Material',
      proveedor: '', clienteId: '', imagen: dataUrlDeTamano(300, 'image/jpeg'), imagenes: [],
      creado: new Date().toISOString(),
    } as any, 'u-factura-reemplazo');
    expect(await contadorDe('u-factura-reemplazo')).toBe(300); // nunca 1300
  });

  it('si el total de la factura (varias imágenes+PDF) supera lo que queda de cuota, se rechaza entera y no queda nada a medias', async () => {
    await crearUsuarioConPlan('u-factura-excede', 'BASIC');
    await ContadorAlmacenamientoModel.create({ usuarioId: 'u-factura-excede', bytesUsados: LIMITES_ALMACENAMIENTO_BYTES.BASIC - 100 });
    await expect(svc.guardarFactura({
      id: 'f-cuota-3', tipo: 'gasto', fecha: '2026-09-01', importe: 100, concepto: 'Material',
      proveedor: '', clienteId: '', imagen: dataUrlDeTamano(200, 'image/jpeg'), imagenes: [],
      creado: new Date().toISOString(),
    } as any, 'u-factura-excede')).rejects.toThrow(ErrorCuotaAlmacenamientoSuperada);
    expect(await contadorDe('u-factura-excede')).toBe(LIMITES_ALMACENAMIENTO_BYTES.BASIC - 100);
    const doc = await FacturaModel.findOne({ id: 'f-cuota-3' }).lean().exec();
    expect(doc).toBeNull(); // nunca se llegó a crear la factura
  });

  it('no vuelve a contar si la subida de la propia factura falla tras reservar cuota (mock de fallo real de almacenamiento)', async () => {
    const { almacenamiento: alm } = await import('./almacenamiento.service.js');
    const original = alm.subir.bind(alm);
    const spy = vi.spyOn(alm, 'subir').mockRejectedValueOnce(new Error('Fallo simulado del proveedor'));
    await crearUsuarioConPlan('u-factura-fallo', 'BASIC');
    await expect(svc.guardarFactura({
      id: 'f-cuota-4', tipo: 'gasto', fecha: '2026-09-01', importe: 100, concepto: 'Material',
      proveedor: '', clienteId: '', imagen: dataUrlDeTamano(400, 'image/jpeg'), imagenes: [],
      creado: new Date().toISOString(),
    } as any, 'u-factura-fallo')).rejects.toThrow('Fallo simulado del proveedor');
    expect(await contadorDe('u-factura-fallo')).toBe(0); // la reserva se liberó al fallar la subida real
    spy.mockRestore();
    void original;
  });
});

describe('Integración — dibujos (guardarDibujo/borrarDibujo, PUT /dibujos/:id)', () => {
  it('guardar un dibujo cuenta TANTO la miniatura subida a R2 COMO el contenido (nunca subido, JSON embebido)', async () => {
    await crearUsuarioConPlan('u-dibujo', 'BASIC');
    const contenido = { elements: [{ type: 'freedraw', id: 'trazo-1' }], appState: {} };
    await svc.guardarDibujo({
      id: 'd-cuota-1', clienteId: '', proyectoId: '', carpetaId: '', nombre: 'Boceto',
      miniatura: dataUrlDeTamano(150, 'image/png'), contenido, version: 1, etiquetas: [],
      creadoEn: new Date().toISOString(), actualizadoEn: new Date().toISOString(),
    }, 'u-dibujo');
    const esperado = 150 + tamanoContenidoJson(contenido);
    expect(await contadorDe('u-dibujo')).toBe(esperado);
  });

  it('editar el dibujo (contenido más grande, miniatura sin cambios) solo reclama la diferencia neta', async () => {
    await crearUsuarioConPlan('u-dibujo-editar', 'BASIC');
    const contenidoInicial = { elements: [{ type: 'freedraw' }] };
    const guardado1 = await svc.guardarDibujo({
      id: 'd-cuota-2', clienteId: '', proyectoId: '', carpetaId: '', nombre: 'Boceto',
      miniatura: dataUrlDeTamano(150, 'image/png'), contenido: contenidoInicial, version: 1, etiquetas: [],
      creadoEn: new Date().toISOString(), actualizadoEn: new Date().toISOString(),
    }, 'u-dibujo-editar');
    const contenidoAmpliado = { elements: [{ type: 'freedraw' }, { type: 'rectangle' }, { type: 'text', text: 'Medida: 120cm' }] };
    await svc.guardarDibujo({
      ...(guardado1 as any),
      miniatura: (guardado1 as any).miniatura, // sin cambios (ya es URL externa)
      contenido: contenidoAmpliado,
    }, 'u-dibujo-editar');
    const esperado = 150 + tamanoContenidoJson(contenidoAmpliado);
    expect(await contadorDe('u-dibujo-editar')).toBe(esperado);
  });

  it('borrar el dibujo libera TANTO la miniatura como el contenido', async () => {
    await crearUsuarioConPlan('u-dibujo-borrar', 'BASIC');
    const contenido = { elements: [{ type: 'freedraw' }] };
    await svc.guardarDibujo({
      id: 'd-cuota-3', clienteId: '', proyectoId: '', carpetaId: '', nombre: 'Boceto',
      miniatura: dataUrlDeTamano(150, 'image/png'), contenido, version: 1, etiquetas: [],
      creadoEn: new Date().toISOString(), actualizadoEn: new Date().toISOString(),
    }, 'u-dibujo-borrar');
    expect(await contadorDe('u-dibujo-borrar')).toBeGreaterThan(0);
    await svc.borrarDibujo('d-cuota-3', 'u-dibujo-borrar');
    expect(await contadorDe('u-dibujo-borrar')).toBe(0);
  });

  it('duplicar un dibujo reclama de nuevo sus mismos bytes (reutiliza el blob, pero cuenta como un dibujo más) — evita saltarse el límite duplicando en bucle', async () => {
    await crearUsuarioConPlan('u-dibujo-duplicar', 'BASIC');
    const contenido = { elements: [{ type: 'freedraw' }] };
    const original = await svc.guardarDibujo({
      id: 'd-cuota-4', clienteId: '', proyectoId: '', carpetaId: '', nombre: 'Boceto',
      miniatura: dataUrlDeTamano(150, 'image/png'), contenido, version: 1, etiquetas: [],
      creadoEn: new Date().toISOString(), actualizadoEn: new Date().toISOString(),
    }, 'u-dibujo-duplicar');
    const antesDeDuplicar = await contadorDe('u-dibujo-duplicar');
    await svc.duplicarDibujo('d-cuota-4', 'u-dibujo-duplicar');
    expect(await contadorDe('u-dibujo-duplicar')).toBe(antesDeDuplicar * 2);
    void original;
  });
});

describe('Integración — modelo 3D manual (asociarModelo3DArchivoProyecto, POST /proyectos/:id/modelo3d/archivo)', () => {
  it('subir un .glb cuenta su tamaño real', async () => {
    await crearUsuarioConPlan('u-modelo3d', 'BASIC');
    await crearClienteYProyecto('p-modelo3d', 'u-modelo3d');
    await svc.asociarModelo3DArchivoProyecto('p-modelo3d', 'u-modelo3d', { nombreArchivo: 'mueble.glb', url: dataUrlDeTamano(2000, 'model/gltf-binary') });
    expect(await contadorDe('u-modelo3d')).toBe(2000);
  });

  it('reemplazar el modelo por uno más pequeño libera la diferencia, nunca deja el blob viejo huérfano ni duplica cuota', async () => {
    await crearUsuarioConPlan('u-modelo3d-reemplazo', 'BASIC');
    await crearClienteYProyecto('p-modelo3d-reemplazo', 'u-modelo3d-reemplazo');
    const doc1 = await svc.asociarModelo3DArchivoProyecto('p-modelo3d-reemplazo', 'u-modelo3d-reemplazo', { nombreArchivo: 'v1.glb', url: dataUrlDeTamano(5000, 'model/gltf-binary') });
    const claveVieja = (doc1 as any).modelo3D.claveAlmacenamiento;
    await svc.asociarModelo3DArchivoProyecto('p-modelo3d-reemplazo', 'u-modelo3d-reemplazo', { nombreArchivo: 'v2.glb', url: dataUrlDeTamano(1200, 'model/gltf-binary') });
    expect(await contadorDe('u-modelo3d-reemplazo')).toBe(1200); // nunca 5000+1200
    expect(await almacenamiento.obtener(claveVieja)).toBeNull(); // blob viejo realmente borrado
  });

  it('quitar el modelo 3D libera su cuota', async () => {
    await crearUsuarioConPlan('u-modelo3d-quitar', 'BASIC');
    await crearClienteYProyecto('p-modelo3d-quitar', 'u-modelo3d-quitar');
    await svc.asociarModelo3DArchivoProyecto('p-modelo3d-quitar', 'u-modelo3d-quitar', { nombreArchivo: 'mueble.glb', url: dataUrlDeTamano(3000, 'model/gltf-binary') });
    await svc.quitarModelo3DProyecto('p-modelo3d-quitar', 'u-modelo3d-quitar');
    expect(await contadorDe('u-modelo3d-quitar')).toBe(0);
  });

  it('borrar el proyecto entero también libera la cuota de su modelo 3D manual', async () => {
    await crearUsuarioConPlan('u-modelo3d-borrar-proyecto', 'BASIC');
    await crearClienteYProyecto('p-modelo3d-borrar-proyecto', 'u-modelo3d-borrar-proyecto');
    await svc.asociarModelo3DArchivoProyecto('p-modelo3d-borrar-proyecto', 'u-modelo3d-borrar-proyecto', { nombreArchivo: 'mueble.glb', url: dataUrlDeTamano(3000, 'model/gltf-binary') });
    await svc.borrarProyecto('p-modelo3d-borrar-proyecto', 'u-modelo3d-borrar-proyecto');
    expect(await contadorDe('u-modelo3d-borrar-proyecto')).toBe(0);
  });
});

describe('Integración — biblioteca de recursos (subirRecursoBiblioteca/borrarRecurso, POST /recursos)', () => {
  it('subir un recurso nuevo cuenta su tamaño', async () => {
    await crearUsuarioConPlan('u-recurso', 'BASIC');
    await svc.subirRecursoBiblioteca({ nombre: 'logo.png', tipo: 'imagen', ambito: 'usuario', etiquetas: [], dataUrl: dataUrlDeTamano(800, 'image/png') }, 'u-recurso');
    expect(await contadorDe('u-recurso')).toBe(800);
  });

  it('subir el MISMO contenido dos veces (deduplicado por hash) NO consume cuota la segunda vez', async () => {
    await crearUsuarioConPlan('u-recurso-dedup', 'BASIC');
    const dataUrl = dataUrlDeTamano(900, 'image/png');
    const r1 = await svc.subirRecursoBiblioteca({ nombre: 'logo.png', tipo: 'imagen', ambito: 'usuario', etiquetas: [], dataUrl }, 'u-recurso-dedup');
    const r2 = await svc.subirRecursoBiblioteca({ nombre: 'logo-otra-vez.png', tipo: 'imagen', ambito: 'usuario', etiquetas: [], dataUrl }, 'u-recurso-dedup');
    expect(r2.id).toBe(r1.id); // reutilizó la entrada existente
    expect(await contadorDe('u-recurso-dedup')).toBe(900); // no 1800
  });

  it('borrar un recurso libera su cuota', async () => {
    await crearUsuarioConPlan('u-recurso-borrar', 'BASIC');
    const r = await svc.subirRecursoBiblioteca({ nombre: 'logo.png', tipo: 'imagen', ambito: 'usuario', etiquetas: [], dataUrl: dataUrlDeTamano(600, 'image/png') }, 'u-recurso-borrar');
    await svc.borrarRecurso(r.id, 'u-recurso-borrar');
    expect(await contadorDe('u-recurso-borrar')).toBe(0);
  });
});

describe('Integración — Motor Documental (procesarRecursosDocumento vía guardarPresupuesto formato:"documento")', () => {
  const USUARIO = 'u-documento-cuota';

  it('una imagen embebida en un presupuesto de formato documento cuenta contra la cuota del usuario', async () => {
    await crearUsuarioConPlan(USUARIO, 'BASIC');
    await ClienteModel.create({ id: 'c-doc-cuota', usuarioId: USUARIO, nombre: 'Cliente', creado: new Date().toISOString() });
    const documento = documentoConElementos([elementoImagen('img-1', PNG_DATA_URL)]);
    await PresupuestoModel.create({ id: 'pr-doc-cuota', usuarioId: USUARIO, clienteId: 'c-doc-cuota', titulo: 'x', formato: 'documento', precioTotal: 100, creado: new Date().toISOString(), actualizado: new Date().toISOString() });
    await svc.guardarPresupuesto({ id: 'pr-doc-cuota', clienteId: 'c-doc-cuota', formato: 'documento', contenidoDocumento: documento } as any, USUARIO);
    const antes = await contadorDe(USUARIO);
    expect(antes).toBeGreaterThan(0);

    // Quitar la imagen en una edición posterior libera su cuota.
    const documentoSinImagen = documentoConElementos([]);
    await svc.guardarPresupuesto({ id: 'pr-doc-cuota', clienteId: 'c-doc-cuota', formato: 'documento', contenidoDocumento: documentoSinImagen } as any, USUARIO);
    expect(await contadorDe(USUARIO)).toBe(0);
  });
});

describe('Integración — firma del Portal público (aceptarPresupuestoPublico, POST /portal/presupuestos/:token/aceptar)', () => {
  const CARPINTERO = 'u-portal-cuota';

  async function crearPresupuestoConEnlace(id: string) {
    await crearUsuarioConPlan(CARPINTERO, 'BASIC');
    await ClienteModel.create({ id: `c-${id}`, usuarioId: CARPINTERO, nombre: 'Cliente portal', creado: new Date().toISOString() });
    await PresupuestoModel.create({
      id, usuarioId: CARPINTERO, clienteId: `c-${id}`, titulo: 'Presupuesto portal', formato: 'simple',
      precioTotal: 500, items: [], alcance: [], creado: new Date().toISOString(), actualizado: new Date().toISOString(),
    });
    const { token } = await svc.generarEnlacePresupuesto(id, CARPINTERO);
    return token;
  }

  it('la firma del cliente cuenta contra la cuota del CARPINTERO (dueño del presupuesto), nunca contra ninguna cuenta del cliente', async () => {
    const token = await crearPresupuestoConEnlace('pr-portal-1');
    await svc.aceptarPresupuestoPublico(token, { ip: '1.2.3.4', userAgent: 'test', firmaDataUrl: PNG_DATA_URL });
    expect(await contadorDe(CARPINTERO)).toBeGreaterThan(0);
  });

  it('si el carpintero no tiene espacio, la aceptación se rechaza por cuota y el ENLACE SIGUE SIRVIENDO para reintentar (nunca se marca como usado)', async () => {
    const token = await crearPresupuestoConEnlace('pr-portal-2');
    await ContadorAlmacenamientoModel.create({ usuarioId: CARPINTERO, bytesUsados: LIMITES_ALMACENAMIENTO_BYTES.BASIC });
    await expect(svc.aceptarPresupuestoPublico(token, { ip: '1.2.3.4', userAgent: 'test', firmaDataUrl: PNG_DATA_URL })).rejects.toThrow(ErrorCuotaAlmacenamientoSuperada);

    const presupuesto = await PresupuestoModel.findOne({ id: 'pr-portal-2' }).lean().exec() as any;
    expect(presupuesto.estado).not.toBe('aceptado'); // nunca se aceptó
    const enlace = await EnlacePresupuestoModel.findOne({ presupuestoId: 'pr-portal-2' }).lean().exec() as any;
    expect(enlace.aceptadoEn).toBeNull(); // el enlace del cliente no quedó "quemado" por un fallo de cuota del carpintero
  });
});

// ── No quedan incrementos huérfanos si una subida falla ───────────────────
describe('Ninguna subida fallida deja el contador incrementado', () => {
  it('si el .glb falla al subirse tras reservar cuota, el contador vuelve a su valor anterior', async () => {
    await crearUsuarioConPlan('u-modelo3d-fallo', 'BASIC');
    await crearClienteYProyecto('p-modelo3d-fallo', 'u-modelo3d-fallo');
    const spy = vi.spyOn(almacenamiento, 'subir').mockRejectedValueOnce(new Error('Fallo simulado del proveedor'));
    await expect(svc.asociarModelo3DArchivoProyecto('p-modelo3d-fallo', 'u-modelo3d-fallo', { nombreArchivo: 'x.glb', url: dataUrlDeTamano(1000, 'model/gltf-binary') })).rejects.toThrow('Fallo simulado del proveedor');
    expect(await contadorDe('u-modelo3d-fallo')).toBe(0);
    spy.mockRestore();
  });
});

// ── Revisión final (05/09/2026, encargo de verificación previo al commit) ──
//
// Hallazgo real durante esta revisión: reemplazar por un archivo más
// PEQUEÑO libera la diferencia de forma OPTIMISTA (antes de saber si el
// resto de la operación va a tener éxito, ver `reclamarEspacioParaSustitucion`)
// — si la subida real o el guardado en Mongo fallaban DESPUÉS, esa
// liberación optimista nunca se deshacía (el código antiguo hacía
// `liberarEspacioAlmacenamiento(Math.max(0, delta))`, un no-op cuando
// `delta` es negativo), dejando el contador PERMANENTEMENTE por debajo de
// lo real — el sentido peligroso (podría permitir superar el límite real
// más adelante), a diferencia de la deuda técnica ya conocida de
// `borrarPresupuesto`/`borrarContrato` (que sí se documenta como
// aceptable: siempre sobreestima, nunca infraestima).
//
// Arreglado en `asociarModelo3DArchivoProyecto` y `guardarDibujo` (los
// ÚNICOS dos puntos que usan `reclamarEspacioParaSustitucion`, confirmado
// por búsqueda exhaustiva) invirtiendo la propia sustitución
// (`reclamarEspacioParaSustitucion(u, p, antiguo, nuevo)`, con los
// argumentos AL REVÉS del original) para deshacer exactamente el ajuste
// aplicado, sea cual sea su sentido — y extendiendo el `try/catch` para
// que también cubra el guardado en Mongo, no solo la subida a R2.
describe('Reemplazos — el contador nunca queda por debajo de lo real si algo falla después (hallazgo de la revisión final)', () => {
  it('modelo 3D: si el guardado en Mongo falla tras reemplazar por uno MÁS PEQUEÑO, el contador vuelve exactamente al tamaño del modelo anterior (nunca se queda de más al liberar)', async () => {
    await crearUsuarioConPlan('u-modelo3d-rollback', 'BASIC');
    await crearClienteYProyecto('p-modelo3d-rollback', 'u-modelo3d-rollback');
    await svc.asociarModelo3DArchivoProyecto('p-modelo3d-rollback', 'u-modelo3d-rollback', { nombreArchivo: 'grande.glb', url: dataUrlDeTamano(5000, 'model/gltf-binary') });
    expect(await contadorDe('u-modelo3d-rollback')).toBe(5000);

    const spy = vi.spyOn(ProyectoModel, 'findOneAndUpdate').mockImplementationOnce(() => {
      throw new Error('Fallo simulado de Mongo');
    });
    await expect(
      svc.asociarModelo3DArchivoProyecto('p-modelo3d-rollback', 'u-modelo3d-rollback', { nombreArchivo: 'pequeno.glb', url: dataUrlDeTamano(200, 'model/gltf-binary') })
    ).rejects.toThrow('Fallo simulado de Mongo');
    spy.mockRestore();

    // Antes del arreglo: quedaba en 200 (la liberación optimista de 4800
    // nunca se deshacía) — por debajo de los 5000 reales todavía en Mongo.
    expect(await contadorDe('u-modelo3d-rollback')).toBe(5000);
  });

  it('dibujo: si el guardado en Mongo falla tras reducir el contenido, el contador vuelve exactamente al total anterior', async () => {
    await crearUsuarioConPlan('u-dibujo-rollback', 'BASIC');
    const contenidoGrande = { elements: Array.from({ length: 50 }, (_, i) => ({ type: 'freedraw', id: `t${i}` })) };
    await svc.guardarDibujo({
      id: 'd-rollback-1', clienteId: '', proyectoId: '', carpetaId: '', nombre: 'Boceto',
      miniatura: '', contenido: contenidoGrande, version: 1, etiquetas: [],
      creadoEn: new Date().toISOString(), actualizadoEn: new Date().toISOString(),
    }, 'u-dibujo-rollback');
    const totalAntes = await contadorDe('u-dibujo-rollback');
    expect(totalAntes).toBeGreaterThan(0);

    const spy = vi.spyOn(DibujoModel, 'findOneAndUpdate').mockImplementationOnce(() => {
      throw new Error('Fallo simulado de Mongo');
    });
    await expect(
      svc.guardarDibujo({
        id: 'd-rollback-1', clienteId: '', proyectoId: '', carpetaId: '', nombre: 'Boceto',
        miniatura: '', contenido: { elements: [] }, version: 1, etiquetas: [],
        creadoEn: new Date().toISOString(), actualizadoEn: new Date().toISOString(),
      }, 'u-dibujo-rollback')
    ).rejects.toThrow('Fallo simulado de Mongo');
    spy.mockRestore();

    expect(await contadorDe('u-dibujo-rollback')).toBe(totalAntes);
  });

  it('modelo 3D: reemplazar por uno MÁS GRANDE y que la subida falle deja el contador exactamente como estaba (regresión — ya funcionaba, se confirma tras el arreglo)', async () => {
    await crearUsuarioConPlan('u-modelo3d-rollback-grande', 'BASIC');
    await crearClienteYProyecto('p-modelo3d-rollback-grande', 'u-modelo3d-rollback-grande');
    await svc.asociarModelo3DArchivoProyecto('p-modelo3d-rollback-grande', 'u-modelo3d-rollback-grande', { nombreArchivo: 'v1.glb', url: dataUrlDeTamano(500, 'model/gltf-binary') });

    const spy = vi.spyOn(almacenamiento, 'subir').mockRejectedValueOnce(new Error('Fallo simulado del proveedor'));
    await expect(
      svc.asociarModelo3DArchivoProyecto('p-modelo3d-rollback-grande', 'u-modelo3d-rollback-grande', { nombreArchivo: 'v2.glb', url: dataUrlDeTamano(3000, 'model/gltf-binary') })
    ).rejects.toThrow('Fallo simulado del proveedor');
    spy.mockRestore();

    expect(await contadorDe('u-modelo3d-rollback-grande')).toBe(500); // nunca 3000, nunca 3500
  });
});

// ── NONE / LIFETIME_FREE (decisión definitiva confirmada por el usuario, 05/09/2026) ──
describe('NONE / LIFETIME_FREE — tratadas exactamente como BASIC (5 GB), decisión definitiva', () => {
  it('limiteAlmacenamientoBytes(NONE) es exactamente el límite de BASIC', () => {
    expect(limiteAlmacenamientoBytes('NONE')).toBe(LIMITES_ALMACENAMIENTO_BYTES.BASIC);
  });
  it('limiteAlmacenamientoBytes(LIFETIME_FREE) es exactamente el límite de BASIC', () => {
    expect(limiteAlmacenamientoBytes('LIFETIME_FREE')).toBe(LIMITES_ALMACENAMIENTO_BYTES.BASIC);
  });
  it('una cuenta NONE puede reclamar hasta 5 GiB exactos y se rechaza al pasarse en 1 byte, igual que BASIC', async () => {
    const limite = LIMITES_ALMACENAMIENTO_BYTES.BASIC;
    await reclamarEspacioAlmacenamiento('u-none-limite', limite, 'NONE');
    expect(await contadorDe('u-none-limite')).toBe(limite);
    await expect(reclamarEspacioAlmacenamiento('u-none-limite', 1, 'NONE')).rejects.toThrow(ErrorCuotaAlmacenamientoSuperada);
  });
  it('una cuenta LIFETIME_FREE puede reclamar hasta 5 GiB exactos y se rechaza al pasarse en 1 byte, igual que BASIC', async () => {
    const limite = LIMITES_ALMACENAMIENTO_BYTES.BASIC;
    await reclamarEspacioAlmacenamiento('u-lifetime-limite', limite, 'LIFETIME_FREE');
    expect(await contadorDe('u-lifetime-limite')).toBe(limite);
    await expect(reclamarEspacioAlmacenamiento('u-lifetime-limite', 1, 'LIFETIME_FREE')).rejects.toThrow(ErrorCuotaAlmacenamientoSuperada);
  });
  it('obtenerUsoAlmacenamiento devuelve el límite de BASIC (no ilimitado, no otro número) tanto para NONE como para LIFETIME_FREE', async () => {
    const usoNone = await obtenerUsoAlmacenamiento('u-none-uso', 'NONE');
    expect(usoNone.ilimitado).toBe(false);
    expect(usoNone.limiteBytes).toBe(LIMITES_ALMACENAMIENTO_BYTES.BASIC);
    const usoLifetime = await obtenerUsoAlmacenamiento('u-lifetime-uso', 'LIFETIME_FREE');
    expect(usoLifetime.ilimitado).toBe(false);
    expect(usoLifetime.limiteBytes).toBe(LIMITES_ALMACENAMIENTO_BYTES.BASIC);
  });
});
