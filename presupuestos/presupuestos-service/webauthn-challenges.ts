/**
 * Registro en memoria de challenges WebAuthn pendientes — mismo patrón que
 * `ia-trabajos.ts` (estado puramente transitorio, con TTL corto, no un dato
 * de negocio que deba sobrevivir a un reinicio del proceso).
 *
 * El challenge en sí (una cadena aleatoria de 32 bytes en base64url,
 * generada por `@simplewebauthn/server`) ES la clave de una sola vez: se
 * guarda al pedir opciones de registro/login, se borra al verificar la
 * respuesta (tanto si es válida como si no) — así una respuesta reenviada
 * (replay) nunca encuentra el challenge por segunda vez, sin necesitar una
 * tabla de "challenges usados" que crecería indefinidamente.
 *
 * Para el registro (usuario ya autenticado) se guarda también `usuarioId`,
 * para que `verificarRegistroWebAuthn` sepa a qué cuenta asociar la nueva
 * credencial sin fiarse de nada que venga del cliente. Para el login
 * (todavía sin sesión — credenciales discoverable/passkey, sin pedir
 * usuario de antemano) no hay `usuarioId` que guardar: la cuenta se
 * resuelve después, a partir del `credentialId` que devuelve el propio
 * autenticador.
 */

type TipoChallenge = 'registro' | 'login';

type ChallengePendiente = {
  tipo: TipoChallenge;
  usuarioId?: string;
  creado: number;
};

/** 2 minutos es tiempo de sobra para completar la ceremonia (elegir huella, Face ID, PIN...) sin dejar challenges vivos innecesariamente. */
const TTL_MS = 2 * 60 * 1000;

const challenges = new Map<string, ChallengePendiente>();

function podarCaducados(): void {
  const limite = Date.now() - TTL_MS;
  for (const [challenge, c] of challenges) {
    if (c.creado < limite) challenges.delete(challenge);
  }
}

export function guardarChallengeRegistro(challenge: string, usuarioId: string): void {
  podarCaducados();
  challenges.set(challenge, { tipo: 'registro', usuarioId, creado: Date.now() });
}

export function guardarChallengeLogin(challenge: string): void {
  podarCaducados();
  challenges.set(challenge, { tipo: 'login', creado: Date.now() });
}

/**
 * Consume (borra) un challenge pendiente del tipo esperado. Devuelve
 * `undefined` si no existe, ya caducó, ya se usó, o es de otro tipo —
 * en cualquiera de esos casos la ceremonia debe rechazarse.
 */
export function consumirChallenge(challenge: string, tipo: TipoChallenge): ChallengePendiente | undefined {
  podarCaducados();
  const c = challenges.get(challenge);
  if (!c || c.tipo !== tipo) return undefined;
  challenges.delete(challenge);
  return c;
}
