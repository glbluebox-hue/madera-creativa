import { randomUUID } from 'node:crypto';
import express from 'express';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { isoBase64URL, isoUint8Array } from '@simplewebauthn/server/helpers';
import { responderError, opcionesCookieRefresh, REFRESH_TTL_MS } from './presupuestos-service.app-root.js';
import type { AuthRequest } from './presupuestos-service.app-root.js';
import { requireAuth } from './presupuestos-service.app-root.js';
import { requirePlan, obtenerPlanUsuario, PRO_O_SUPERIOR } from './planes.js';
import { validar } from './validacion.middleware.js';
import { limitadorWebAuthnLogin } from './rate-limit.middleware.js';
import { esquemaWebAuthnRegistroVerificar, esquemaWebAuthnLoginVerificar } from './esquemas-validacion.js';
import { rpID, rpName, origenEsperado } from './webauthn-config.js';
import { guardarChallengeRegistro, guardarChallengeLogin, consumirChallenge } from './webauthn-challenges.js';
import { CredencialWebAuthnModel, conectarCredencialesWebAuthn } from './credencial-webauthn.model.js';
import { UsuarioModel, conectarUsuarios } from './usuario.model.js';
import { emitirSesion } from './sesion.service.js';
import { logger } from './logger.service.js';

/**
 * Rutas del acceso biométrico (WebAuthn/passkeys) — montadas bajo
 * `/auth/webauthn` en `presupuestos-service.app-root.ts` (mismo patrón que
 * `crearRouterIA()`). Ningún dato biométrico (huella, cara, PIN) llega
 * nunca a este servidor: el navegador y el autenticador del dispositivo lo
 * resuelven en local; aquí solo se ve una clave pública y un contador —ver
 * `credencial-webauthn.model.ts`.
 *
 * Dos ceremonias, cuatro rutas:
 * - Registro (`/registro/*`): exige sesión ya iniciada por contraseña
 *   (`requireAuth`) — es como se activa el acceso biométrico desde Ajustes,
 *   nunca una forma de crear cuenta.
 * - Login (`/login/*`): sin sesión previa — es la propia forma de entrar.
 *   "Discoverable credentials" (passkeys): `allowCredentials` se omite a
 *   propósito en las opciones de autenticación, así el navegador deja
 *   elegir al usuario entre las credenciales guardadas para este RP ID sin
 *   pedir un nombre de usuario antes (ver `webauthn-challenges.ts`).
 *
 * `limitadorWebAuthnLogin` se aplica solo a `/login/*` (superficie sin
 * autenticar) — nunca a `/registro/*` ni `/credenciales`, que ya exigen
 * `requireAuth` y comparten el budget general de la API. Es un límite propio
 * (no `limitadorAuth`, el de contraseña): una aserción WebAuthn exige
 * posesión física del autenticador, así que no hace falta el mismo budget
 * estricto pensado para frenar fuerza bruta de contraseña — ver el
 * comentario en `rate-limit.middleware.ts`.
 */

function generarIdCredencial(): string {
  return randomUUID();
}

export function crearRouterWebAuthn(): express.Router {
  const router = express.Router();

  // ── Registro (activar acceso biométrico) ────────────────────────────────────

  /**
   * Opciones de registro para el usuario ya autenticado. `excludeCredentials`
   * evita que el mismo autenticador quede registrado dos veces para la
   * misma cuenta. `residentKey: 'required'` fuerza una credencial
   * "discoverable" (passkey) — imprescindible para el login sin pedir
   * usuario de antemano.
   */
  // PRO+ (Fase 2, 04/09/2026) — solo REGISTRAR una credencial nueva; el
  // login con una ya registrada (más abajo, `/login/verificar`) se mantiene
  // abierto aunque la cuenta baje de plan después, mismo criterio que el
  // resto de la app: los datos/accesos ya concedidos no se revocan solos.
  router.post('/registro/opciones', requireAuth, requirePlan(PRO_O_SUPERIOR), async (req: AuthRequest, res) => {
    try {
      const origen = origenEsperado(req);
      if (!origen) { res.status(400).json({ error: 'Origen no permitido.' }); return; }

      const usuarioId = req.usuarioId!;
      await conectarCredencialesWebAuthn();
      const usuario = await UsuarioModel.findOne({ id: usuarioId }).lean().exec() as any;
      if (!usuario) { res.status(404).json({ error: 'Usuario no encontrado' }); return; }

      const existentes = await CredencialWebAuthnModel.find({ usuarioId }).lean().exec() as any[];

      const opciones = await generateRegistrationOptions({
        rpName,
        rpID: rpID(origen),
        userName: usuario.nombre,
        userID: isoUint8Array.fromUTF8String(usuarioId),
        attestationType: 'none',
        excludeCredentials: existentes.map((c) => ({ id: c.credentialId, transports: c.transports })),
        authenticatorSelection: {
          residentKey: 'required',
          userVerification: 'preferred',
          authenticatorAttachment: 'platform',
        },
      });

      guardarChallengeRegistro(opciones.challenge, usuarioId);
      res.json(opciones);
    } catch (err) { responderError(req, res, err); }
  });

  /**
   * Verifica la respuesta del autenticador y, si es válida, guarda la
   * credencial asociada a `req.usuarioId` — nunca a un id que venga del
   * cuerpo de la petición. El challenge se consume dentro del propio
   * callback `expectedChallenge`: si no existe, ya se usó, caducó, o
   * pertenece a otro usuario, la verificación falla sin más detalle
   * (protección contra replay y contra asociar la credencial a la cuenta
   * equivocada).
   */
  router.post('/registro/verificar', requireAuth, requirePlan(PRO_O_SUPERIOR), validar(esquemaWebAuthnRegistroVerificar), async (req: AuthRequest, res) => {
    try {
      const usuarioId = req.usuarioId!;
      const { respuesta, nombreDispositivo } = req.body as { respuesta: any; nombreDispositivo: string };

      const origen = origenEsperado(req);
      if (!origen) { res.status(400).json({ error: 'Origen no permitido.' }); return; }

      const verificacion = await verifyRegistrationResponse({
        response: respuesta,
        expectedChallenge: (challenge) => {
          const pendiente = consumirChallenge(challenge, 'registro');
          return !!pendiente && pendiente.usuarioId === usuarioId;
        },
        expectedOrigin: origen,
        expectedRPID: rpID(origen),
        requireUserVerification: true,
      });

      if (!verificacion.verified || !verificacion.registrationInfo) {
        res.status(400).json({ error: 'No se pudo verificar el registro del autenticador.' }); return;
      }

      const { credential, credentialDeviceType, credentialBackedUp } = verificacion.registrationInfo;

      await conectarCredencialesWebAuthn();
      const yaExiste = await CredencialWebAuthnModel.findOne({ credentialId: credential.id }).lean().exec();
      if (yaExiste) { res.status(409).json({ error: 'Este autenticador ya está registrado.' }); return; }

      await CredencialWebAuthnModel.create({
        id: generarIdCredencial(),
        usuarioId,
        credentialId: credential.id,
        publicKey: isoBase64URL.fromBuffer(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports || [],
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        nombreDispositivo,
        creadoEn: new Date().toISOString(),
        ultimoUso: '',
      });

      res.json({ ok: true });
    } catch (err) {
      logger.warn({ err, requestId: req.requestId, usuarioId: req.usuarioId }, '[webauthn] Fallo verificando registro');
      responderError(req, res, err);
    }
  });

  // ── Credenciales registradas (gestión desde Ajustes) ────────────────────────

  /** Nunca expone `credentialId`, `publicKey` ni `counter` — solo lo que la interfaz necesita mostrar. */
  router.get('/credenciales', requireAuth, async (req: AuthRequest, res) => {
    try {
      await conectarCredencialesWebAuthn();
      const items = await CredencialWebAuthnModel.find({ usuarioId: req.usuarioId }).lean().exec() as any[];
      res.json(items.map((c) => ({
        id: c.id,
        nombreDispositivo: c.nombreDispositivo,
        creadoEn: c.creadoEn,
        ultimoUso: c.ultimoUso,
      })));
    } catch (err) { responderError(req, res, err); }
  });

  /**
   * Borra una credencial propia (desactivar, o paso previo a
   * "volver a registrar"). El filtro incluye `usuarioId: req.usuarioId` —
   * no solo el `id` de la credencial — para que nadie pueda borrar una
   * credencial ajena adivinando o probando ids.
   */
  router.delete('/credenciales/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      await conectarCredencialesWebAuthn();
      await CredencialWebAuthnModel.deleteOne({ id: req.params.id, usuarioId: req.usuarioId });
      res.json({ ok: true });
    } catch (err) { responderError(req, res, err); }
  });

  // ── Login (entrar con el autenticador del dispositivo) ──────────────────────

  /**
   * Opciones de autenticación sin usuario previo: `allowCredentials` se
   * omite a propósito (discoverable credentials / passkeys) — el propio
   * navegador ofrece las credenciales guardadas para este RP ID.
   */
  router.post('/login/opciones', limitadorWebAuthnLogin, async (req: AuthRequest, res) => {
    try {
      const origen = origenEsperado(req);
      if (!origen) { res.status(400).json({ error: 'Origen no permitido.' }); return; }

      const opciones = await generateAuthenticationOptions({
        rpID: rpID(origen),
        userVerification: 'preferred',
      });
      guardarChallengeLogin(opciones.challenge);
      res.json(opciones);
    } catch (err) { responderError(req, res, err); }
  });

  /**
   * Verifica la aserción, resuelve la cuenta a partir del `credentialId`
   * devuelto por el autenticador (nunca de nada enviado explícitamente por
   * el cliente) y, si todo es correcto, emite la misma sesión real que
   * `/auth/login` (access token + cookie `mc_refresh`) mediante
   * `emitirSesion` (`sesion.service.ts`).
   */
  router.post('/login/verificar', limitadorWebAuthnLogin, validar(esquemaWebAuthnLoginVerificar), async (req: AuthRequest, res) => {
    try {
      const { respuesta } = req.body as { respuesta: any };

      const origen = origenEsperado(req);
      if (!origen) { res.status(400).json({ error: 'Origen no permitido.' }); return; }

      await conectarCredencialesWebAuthn();
      const credencial = await CredencialWebAuthnModel.findOne({ credentialId: respuesta.id }).exec();
      if (!credencial) { res.status(401).json({ error: 'Credencial no reconocida. Usa tu contraseña.' }); return; }

      const verificacion = await verifyAuthenticationResponse({
        response: respuesta,
        expectedChallenge: (challenge) => !!consumirChallenge(challenge, 'login'),
        expectedOrigin: origen,
        expectedRPID: rpID(origen),
        credential: {
          id: credencial.credentialId,
          publicKey: isoBase64URL.toBuffer(credencial.publicKey),
          counter: credencial.counter,
          transports: credencial.transports,
        },
        requireUserVerification: true,
      });

      if (!verificacion.verified) {
        res.status(401).json({ error: 'No se pudo verificar la credencial. Usa tu contraseña.' }); return;
      }

      const { newCounter } = verificacion.authenticationInfo;
      // Protección anti-clonado: el contador debe crecer estrictamente en
      // cada uso — salvo que sea 0, que es el valor que reportan siempre
      // muchas passkeys sincronizadas (iCloud Keychain, Password Manager de
      // Google): no implementan contador por diseño, así que un 0
      // constante ahí es normal, no un indicio de clonación.
      if (newCounter !== 0 && newCounter <= credencial.counter) {
        logger.warn(
          { requestId: req.requestId, usuarioId: credencial.usuarioId, credencialId: credencial.id },
          '[webauthn] Contador de firmas no creciente — posible credencial clonada, login rechazado'
        );
        res.status(401).json({ error: 'No se pudo verificar la credencial. Usa tu contraseña.' });
        return;
      }

      await conectarUsuarios();
      const usuario = await UsuarioModel.findOne({ id: credencial.usuarioId }).lean().exec() as any;
      if (!usuario || usuario.estado !== 'activo') { res.status(403).json({ error: 'Acceso denegado' }); return; }

      credencial.counter = newCounter;
      credencial.ultimoUso = new Date().toISOString();
      await credencial.save();
      await UsuarioModel.updateOne({ id: usuario.id }, { ultimoAcceso: new Date().toISOString() });

      const { accessToken, refreshToken } = await emitirSesion(usuario.id, usuario.esAdmin);
      res.cookie('mc_refresh', refreshToken, opcionesCookieRefresh(REFRESH_TTL_MS));
      // Mismo motivo que /auth/login (Fase 1, 04/09/2026): esta ruta emite
      // sesión igual que el login por contraseña, así que debe devolver el
      // mismo `plan` — mismo contrato, dos formas de entrar.
      const plan = await obtenerPlanUsuario(usuario.id);
      res.json({ ok: true, id: usuario.id, nombre: usuario.nombre, esAdmin: usuario.esAdmin, estado: usuario.estado, plan, accessToken });
    } catch (err) {
      logger.warn({ err, requestId: req.requestId }, '[webauthn] Fallo verificando login');
      responderError(req, res, err);
    }
  });

  return router;
}
