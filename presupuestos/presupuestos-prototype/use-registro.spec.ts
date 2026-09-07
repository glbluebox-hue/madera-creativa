import { debeRegistrarseLocalmente } from './use-registro.js';

/**
 * Corrección del flujo de registro (05/09/2026, auditoría del bug de
 * "entra sin verificar el email") — `login-page.tsx` llamaba a la sesión
 * LOCAL heredada (`onRegistrar` → `use-auth.ts`) tanto si el registro en
 * el SERVIDOR tenía éxito como si no, lo que autenticaba a la app antes
 * de que el email estuviera verificado. `debeRegistrarseLocalmente()` es
 * la función pura que ahora decide esto — se prueba aquí directamente,
 * sin simular la interacción completa del formulario (este módulo no
 * tiene infraestructura de tests de interacción de React).
 */
describe('debeRegistrarseLocalmente — cuándo se permite la sesión local heredada', () => {
  it('A. registro en servidor con éxito: NUNCA debe crear sesión local (el email todavía no está verificado)', () => {
    expect(debeRegistrarseLocalmente({ ok: true })).toBe(false);
  });

  it('servidor inalcanzable (error-red): sí se permite la reserva local, igual que ya hace el login', () => {
    expect(debeRegistrarseLocalmente({ ok: false, codigo: 'error-red' })).toBe(true);
  });

  it('error real del servidor (credenciales/validación): nunca crea sesión local', () => {
    expect(debeRegistrarseLocalmente({ ok: false, codigo: 'credenciales' })).toBe(false);
  });

  it('sin código de error (caso residual, ok:false sin codigo): nunca crea sesión local por defecto', () => {
    expect(debeRegistrarseLocalmente({ ok: false })).toBe(false);
  });
});
