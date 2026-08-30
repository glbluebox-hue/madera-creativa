import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { TrimbleConexionModel } from './trimble-conexion.model.js';

/**
 * Servicio de conexión Trimble (30/08/2026) — `trimble-oauth.js` se simula
 * por completo: ningún test llama de verdad a `id.trimble.com`. Cada test
 * usa su propio `usuarioId` (nunca reutilizado entre tests): el caché de
 * access tokens en memoria es deliberadamente un Map de proceso, y
 * reutilizar un id entre tests contaminaría un test con el caché que dejó
 * el anterior — exactamente el tipo de fuga que este aislamiento evita en
 * producción entre usuarios reales.
 */
const refrescarTokensMock = vi.fn();
const obtenerUsuarioTrimbleMock = vi.fn();
const revocarTokenMock = vi.fn();
vi.mock('./trimble-oauth.js', () => ({
  refrescarTokens: (...args: unknown[]) => refrescarTokensMock(...args),
  obtenerUsuarioTrimble: (...args: unknown[]) => obtenerUsuarioTrimbleMock(...args),
  revocarToken: (...args: unknown[]) => revocarTokenMock(...args),
}));

const {
  obtenerEstadoConexion, registrarConexionInicial, obtenerAccessTokenValido, desconectar,
  ErrorSinConexionTrimble, ErrorConexionTrimbleCaducada,
} = await import('./trimble-conexion.service.js');

let mongod: MongoMemoryServer;
let contador = 0;
/** Un usuarioId nuevo por test — ver comentario de arriba. */
function usuarioNuevo(): string { return `usuario-trimble-test-${++contador}`; }

const TOKENS_OK = { accessToken: 'access-1', refreshToken: 'refresh-1', expiraEnSegundos: 3600, scope: 'openid email tc:project:read' };
/** `expiraEnSegundos` negativo -> el caché queda YA expirado nada más registrar, para poder probar el refresco sin exportar el Map interno. */
const TOKENS_YA_EXPIRADOS = { ...TOKENS_OK, expiraEnSegundos: -10 };

beforeAll(async () => {
  process.env.TRIMBLE_TOKEN_ENCRYPTION_KEY = 'clave-de-pruebas-no-real-1234567890';
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URL = mongod.getUri();
  await mongoose.connect(process.env.MONGO_URL);
}, 60_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await TrimbleConexionModel.deleteMany({});
  refrescarTokensMock.mockReset();
  obtenerUsuarioTrimbleMock.mockReset();
  revocarTokenMock.mockReset();
});

describe('obtenerEstadoConexion', () => {
  it('sin conexión guardada, conectado:false', async () => {
    expect(await obtenerEstadoConexion(usuarioNuevo())).toEqual({ conectado: false, trimbleEmail: '' });
  });

  it('tras registrar una conexión inicial, conectado:true con el email real', async () => {
    const usuario = usuarioNuevo();
    obtenerUsuarioTrimbleMock.mockResolvedValue({ email: 'luca@maderacreativa.com' });
    await registrarConexionInicial(usuario, TOKENS_OK);
    expect(await obtenerEstadoConexion(usuario)).toEqual({ conectado: true, trimbleEmail: 'luca@maderacreativa.com' });
  });
});

describe('registrarConexionInicial — nunca guarda el refresh token en claro', () => {
  it('el documento guardado en Mongo no contiene el refresh token real como texto', async () => {
    const usuario = usuarioNuevo();
    obtenerUsuarioTrimbleMock.mockResolvedValue({ email: 'x@y.com' });
    await registrarConexionInicial(usuario, TOKENS_OK);
    const doc = await TrimbleConexionModel.findOne({ usuarioId: usuario }).lean().exec();
    expect((doc as any).refreshTokenCifrado).not.toContain(TOKENS_OK.refreshToken);
  });
});

describe('obtenerAccessTokenValido', () => {
  it('sin conexión, lanza ErrorSinConexionTrimble', async () => {
    await expect(obtenerAccessTokenValido(usuarioNuevo())).rejects.toBeInstanceOf(ErrorSinConexionTrimble);
  });

  it('justo tras conectar, reutiliza el access token ya obtenido en el login — no gasta el refresh token de inmediato', async () => {
    const usuario = usuarioNuevo();
    obtenerUsuarioTrimbleMock.mockResolvedValue({ email: 'x@y.com' });
    await registrarConexionInicial(usuario, TOKENS_OK);

    const token = await obtenerAccessTokenValido(usuario);
    expect(token).toBe(TOKENS_OK.accessToken);
    expect(refrescarTokensMock).not.toHaveBeenCalled();
  });

  it('una segunda llamada dentro de la misma hora sigue sin refrescar (caché en memoria)', async () => {
    const usuario = usuarioNuevo();
    obtenerUsuarioTrimbleMock.mockResolvedValue({ email: 'x@y.com' });
    await registrarConexionInicial(usuario, TOKENS_OK);

    await obtenerAccessTokenValido(usuario);
    await obtenerAccessTokenValido(usuario);
    expect(refrescarTokensMock).not.toHaveBeenCalled();
  });

  it('con el access token caducado, refresca en silencio y devuelve el nuevo', async () => {
    const usuario = usuarioNuevo();
    obtenerUsuarioTrimbleMock.mockResolvedValue({ email: 'x@y.com' });
    await registrarConexionInicial(usuario, TOKENS_YA_EXPIRADOS); // caché ya inválido desde el principio
    refrescarTokensMock.mockResolvedValue({ accessToken: 'access-2', refreshToken: 'refresh-2', expiraEnSegundos: 3600, scope: TOKENS_OK.scope });

    const token = await obtenerAccessTokenValido(usuario);
    expect(token).toBe('access-2');
    expect(refrescarTokensMock).toHaveBeenCalledTimes(1);
  });

  it('tras refrescar una vez, la siguiente llamada reutiliza el token nuevo sin refrescar otra vez', async () => {
    const usuario = usuarioNuevo();
    obtenerUsuarioTrimbleMock.mockResolvedValue({ email: 'x@y.com' });
    await registrarConexionInicial(usuario, TOKENS_YA_EXPIRADOS);
    refrescarTokensMock.mockResolvedValue({ accessToken: 'access-2', refreshToken: 'refresh-2', expiraEnSegundos: 3600, scope: TOKENS_OK.scope });

    await obtenerAccessTokenValido(usuario);
    const token2 = await obtenerAccessTokenValido(usuario);
    expect(token2).toBe('access-2');
    expect(refrescarTokensMock).toHaveBeenCalledTimes(1);
  });

  it('si Trimble rechaza el refresh token (revocado/caducado), lanza ErrorConexionTrimbleCaducada — nunca falla en silencio', async () => {
    const usuario = usuarioNuevo();
    obtenerUsuarioTrimbleMock.mockResolvedValue({ email: 'x@y.com' });
    await registrarConexionInicial(usuario, TOKENS_YA_EXPIRADOS);
    refrescarTokensMock.mockRejectedValue(new Error('Trimble Identity respondió 400'));

    await expect(obtenerAccessTokenValido(usuario)).rejects.toBeInstanceOf(ErrorConexionTrimbleCaducada);
  });
});

describe('desconectar', () => {
  it('borra la conexión guardada e intenta revocar el token en Trimble', async () => {
    const usuario = usuarioNuevo();
    obtenerUsuarioTrimbleMock.mockResolvedValue({ email: 'x@y.com' });
    await registrarConexionInicial(usuario, TOKENS_OK);

    await desconectar(usuario);

    expect(revocarTokenMock).toHaveBeenCalledTimes(1);
    expect(await obtenerEstadoConexion(usuario)).toEqual({ conectado: false, trimbleEmail: '' });
  });

  it('un usuario nunca queda afectado por la desconexión de otro', async () => {
    const usuarioAfectado = usuarioNuevo();
    const usuarioDesconectado = usuarioNuevo();
    obtenerUsuarioTrimbleMock.mockResolvedValue({ email: 'x@y.com' });
    await registrarConexionInicial(usuarioAfectado, TOKENS_OK);
    await desconectar(usuarioDesconectado); // nunca se había conectado
    expect(await obtenerEstadoConexion(usuarioAfectado)).toEqual({ conectado: true, trimbleEmail: 'x@y.com' });
  });
});
