import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { EmpresaModel } from './cliente.model.js';
import { InvestigacionMercadoModel } from './investigacion-mercado.model.js';

/**
 * Investigación de Mercado con IA (30/08/2026) — el proveedor de OpenAI se
 * simula por completo (`vi.mock`): ningún test de este archivo hace una
 * búsqueda web real (encargo, punto 14 "Tests obligatorios" — búsqueda:
 * "ningún test realiza búsquedas web reales").
 */
const buscarEnWebMock = vi.fn();
const extraerJsonEstructuradoMock = vi.fn();
vi.mock('./ia-proveedor-openai.js', () => ({
  buscarEnWeb: (...args: unknown[]) => buscarEnWebMock(...args),
  extraerJsonEstructurado: (...args: unknown[]) => extraerJsonEstructuradoMock(...args),
}));

const { investigarMercado, ErrorSinUbicacionEmpresa } = await import('./investigacion-mercado.js');

let mongod: MongoMemoryServer;

const USUARIO = 'usuario-mercado-ia-test';

const CANDIDATO_OK = {
  precio: 5500, moneda: 'EUR', ubicacion: 'Tenerife', tipoTrabajoDetectado: 'Cocina a medida',
  queIncluye: 'mobiliario y encimera', queNoIncluye: 'electrodomésticos', calidad: 'estandar',
  ivaIncluido: 'no', instalacionIncluida: 'si', fechaReferencia: '2026-05', fuente: 'Habitissimo',
  url: 'https://www.habitissimo.es/precio-cocina-tenerife', extracto: 'Cocina a medida por 5500€ en Tenerife.',
  confianza: 'media', explicacionComparabilidad: 'Mismo alcance y zona.',
};

function respuestaBusquedaOk() {
  return {
    textoGrounded: 'Se encontró una cocina a medida en Tenerife por 5500€ (habitissimo.es).',
    urlsCitadas: [CANDIDATO_OK.url],
    tokensEntrada: 100,
    tokensSalida: 50,
    modelo: 'gpt-4o-mini',
  };
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URL = mongod.getUri();
  await mongoose.connect(process.env.MONGO_URL);
}, 60_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await InvestigacionMercadoModel.deleteMany({});
  await EmpresaModel.deleteMany({});
  buscarEnWebMock.mockReset();
  extraerJsonEstructuradoMock.mockReset();
});

async function configurarUbicacion(usuarioId: string) {
  await EmpresaModel.create({ usuarioId, comunidadAutonoma: 'Canarias', provincia: 'Santa Cruz de Tenerife', isla: 'Tenerife' });
}

const PARAMS_BASE = {
  usuarioId: USUARIO,
  tipoTrabajo: 'Cocina',
  nivelGeografico: 'local' as const,
  alcance: 'mobiliario_encimera' as const,
  nivelCalidad: null,
  descripcionLibre: '',
};

describe('investigarMercado — sin ubicación configurada', () => {
  it('rechaza con un error claro si la empresa no tiene isla/provincia', async () => {
    await expect(investigarMercado(PARAMS_BASE)).rejects.toBeInstanceOf(ErrorSinUbicacionEmpresa);
    expect(buscarEnWebMock).not.toHaveBeenCalled();
  });
});

describe('investigarMercado — extracción, nunca inventar', () => {
  beforeEach(async () => { await configurarUbicacion(USUARIO); });

  it('llama al proveedor simulado y devuelve el candidato con precio/URL/fuente conservados', async () => {
    buscarEnWebMock.mockResolvedValue(respuestaBusquedaOk());
    extraerJsonEstructuradoMock.mockResolvedValue({
      datos: { sinResultadosFiables: false, motivoSinResultados: null, candidatos: [CANDIDATO_OK] },
      tokensEntrada: 80, tokensSalida: 40, modelo: 'gpt-4o-mini',
    });

    const resultado = await investigarMercado(PARAMS_BASE);

    expect(buscarEnWebMock).toHaveBeenCalledTimes(1);
    expect(extraerJsonEstructuradoMock).toHaveBeenCalledTimes(1);
    expect(resultado.sinResultadosFiables).toBe(false);
    expect(resultado.candidatos).toHaveLength(1);
    expect(resultado.candidatos[0].precio).toBe(5500);
    expect(resultado.candidatos[0].url).toBe(CANDIDATO_OK.url);
    expect(resultado.candidatos[0].fuente).toBe('Habitissimo');
    expect(resultado.desdeCache).toBe(false);
  });

  it('un dato ausente en la fuente llega como null/"desconocido", nunca inventado', async () => {
    buscarEnWebMock.mockResolvedValue(respuestaBusquedaOk());
    extraerJsonEstructuradoMock.mockResolvedValue({
      datos: {
        sinResultadosFiables: false, motivoSinResultados: null,
        candidatos: [{ ...CANDIDATO_OK, calidad: null, ivaIncluido: 'desconocido', fechaReferencia: null }],
      },
      tokensEntrada: 80, tokensSalida: 40, modelo: 'gpt-4o-mini',
    });

    const resultado = await investigarMercado(PARAMS_BASE);
    expect(resultado.candidatos[0].calidad).toBeNull();
    expect(resultado.candidatos[0].ivaIncluido).toBe('desconocido');
    expect(resultado.candidatos[0].fechaReferencia).toBeNull();
  });

  it('una URL que el modelo inventa en el paso de extracción (no citada en la búsqueda) se descarta a null', async () => {
    buscarEnWebMock.mockResolvedValue(respuestaBusquedaOk()); // solo cita CANDIDATO_OK.url
    extraerJsonEstructuradoMock.mockResolvedValue({
      datos: {
        sinResultadosFiables: false, motivoSinResultados: null,
        candidatos: [{ ...CANDIDATO_OK, url: 'https://esta-url-no-fue-citada.example.com' }],
      },
      tokensEntrada: 80, tokensSalida: 40, modelo: 'gpt-4o-mini',
    });

    const resultado = await investigarMercado(PARAMS_BASE);
    expect(resultado.candidatos[0].url).toBeNull();
  });

  it('sin resultados fiables devuelve un array vacío con motivo, no un candidato falso', async () => {
    buscarEnWebMock.mockResolvedValue({ ...respuestaBusquedaOk(), textoGrounded: 'No he encontrado suficientes referencias fiables.', urlsCitadas: [] });
    extraerJsonEstructuradoMock.mockResolvedValue({
      datos: { sinResultadosFiables: true, motivoSinResultados: 'No se encontraron fuentes verificables.', candidatos: [] },
      tokensEntrada: 60, tokensSalida: 20, modelo: 'gpt-4o-mini',
    });

    const resultado = await investigarMercado(PARAMS_BASE);
    expect(resultado.sinResultadosFiables).toBe(true);
    expect(resultado.candidatos).toHaveLength(0);
    expect(resultado.motivoSinResultados).toMatch(/no se encontraron/i);
  });
});

describe('investigarMercado — caché de 24h', () => {
  beforeEach(async () => { await configurarUbicacion(USUARIO); });

  it('una búsqueda equivalente dentro de la ventana no vuelve a llamar al proveedor', async () => {
    buscarEnWebMock.mockResolvedValue(respuestaBusquedaOk());
    extraerJsonEstructuradoMock.mockResolvedValue({
      datos: { sinResultadosFiables: false, motivoSinResultados: null, candidatos: [CANDIDATO_OK] },
      tokensEntrada: 80, tokensSalida: 40, modelo: 'gpt-4o-mini',
    });

    const primera = await investigarMercado(PARAMS_BASE);
    expect(primera.desdeCache).toBe(false);
    expect(buscarEnWebMock).toHaveBeenCalledTimes(1);

    const segunda = await investigarMercado(PARAMS_BASE);
    expect(segunda.desdeCache).toBe(true);
    expect(segunda.candidatos).toHaveLength(1);
    expect(segunda.candidatos[0].precio).toBe(5500);
    // Ninguna llamada nueva al proveedor simulado — sigue en 1.
    expect(buscarEnWebMock).toHaveBeenCalledTimes(1);
    expect(extraerJsonEstructuradoMock).toHaveBeenCalledTimes(1);
  });

  it('una investigación caducada (más de 24h) sí puede volver a ejecutarse', async () => {
    buscarEnWebMock.mockResolvedValue(respuestaBusquedaOk());
    extraerJsonEstructuradoMock.mockResolvedValue({
      datos: { sinResultadosFiables: false, motivoSinResultados: null, candidatos: [CANDIDATO_OK] },
      tokensEntrada: 80, tokensSalida: 40, modelo: 'gpt-4o-mini',
    });

    await investigarMercado(PARAMS_BASE);
    expect(buscarEnWebMock).toHaveBeenCalledTimes(1);

    // Simula que la fila cacheada es de hace más de 24h, retrocediendo su `creado` directamente en Mongo.
    await InvestigacionMercadoModel.updateMany({}, { creado: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() });

    const segunda = await investigarMercado(PARAMS_BASE);
    expect(segunda.desdeCache).toBe(false);
    expect(buscarEnWebMock).toHaveBeenCalledTimes(2);
  });

  it('un tipo de trabajo distinto no reutiliza la caché de otro', async () => {
    buscarEnWebMock.mockResolvedValue(respuestaBusquedaOk());
    extraerJsonEstructuradoMock.mockResolvedValue({
      datos: { sinResultadosFiables: false, motivoSinResultados: null, candidatos: [CANDIDATO_OK] },
      tokensEntrada: 80, tokensSalida: 40, modelo: 'gpt-4o-mini',
    });

    await investigarMercado(PARAMS_BASE);
    await investigarMercado({ ...PARAMS_BASE, tipoTrabajo: 'Armario' });
    expect(buscarEnWebMock).toHaveBeenCalledTimes(2);
  });
});
