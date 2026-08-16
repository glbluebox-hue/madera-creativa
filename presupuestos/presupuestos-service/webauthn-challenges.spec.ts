import { guardarChallengeRegistro, guardarChallengeLogin, consumirChallenge } from './webauthn-challenges.js';

describe('webauthn-challenges (acceso biométrico — gestión de challenges)', () => {
  it('consume un challenge de registro válido y devuelve el usuarioId asociado', () => {
    guardarChallengeRegistro('challenge-1', 'usuario-1');
    const pendiente = consumirChallenge('challenge-1', 'registro');
    expect(pendiente).toEqual({ tipo: 'registro', usuarioId: 'usuario-1', creado: expect.any(Number) });
  });

  it('un challenge solo puede consumirse una vez (protección contra replay)', () => {
    guardarChallengeRegistro('challenge-2', 'usuario-1');
    expect(consumirChallenge('challenge-2', 'registro')).toBeDefined();
    expect(consumirChallenge('challenge-2', 'registro')).toBeUndefined();
  });

  it('no consume un challenge de un tipo distinto al esperado', () => {
    guardarChallengeLogin('challenge-3');
    expect(consumirChallenge('challenge-3', 'registro')).toBeUndefined();
    // Sigue disponible para su tipo correcto — la comprobación de tipo no lo invalida.
    expect(consumirChallenge('challenge-3', 'login')).toBeDefined();
  });

  it('un challenge de login no lleva usuarioId asociado', () => {
    guardarChallengeLogin('challenge-4');
    const pendiente = consumirChallenge('challenge-4', 'login');
    expect(pendiente?.usuarioId).toBeUndefined();
  });

  it('devuelve undefined para un challenge que nunca existió', () => {
    expect(consumirChallenge('nunca-existio', 'login')).toBeUndefined();
  });

  it('caduca un challenge más antiguo que el TTL (2 minutos)', () => {
    const ahoraReal = Date.now;
    try {
      let ahora = 1_000_000;
      Date.now = () => ahora;
      guardarChallengeRegistro('challenge-caduca', 'usuario-1');
      ahora += 2 * 60 * 1000 + 1; // 1ms después del TTL
      expect(consumirChallenge('challenge-caduca', 'registro')).toBeUndefined();
    } finally {
      Date.now = ahoraReal;
    }
  });
});
