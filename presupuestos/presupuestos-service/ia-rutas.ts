import express from 'express';
import { responderError } from './presupuestos-service.app-root.js';
import type { AuthRequest } from './presupuestos-service.app-root.js';
import { validar } from './validacion.middleware.js';
import { esquemaGenerarIA, esquemaEjecutarHerramientaIA } from './esquemas-validacion.js';
import { ServicioCentralIA } from './ia-servicio-central.js';
import { obtenerCapacidad, ErrorCapacidadDesconocida } from './ia-registro-capacidades.js';
import { ErrorPerfilNoDisponible } from './ia-selector-modelo.js';
import { ErrorProveedorDesconocido } from './ia-registro-proveedores.js';
import { ErrorProveedorInalcanzable } from './ia-proveedor.js';
import { crearTrabajo, completarTrabajo, fallarTrabajo, obtenerTrabajo } from './ia-trabajos.js';
import { limitadorIA, limitadorSondeoIA } from './rate-limit.middleware.js';
// Importado solo por su efecto secundario: registra las capacidades
// `asistente-global` y `redactar-presupuesto` en `ia-registro-capacidades.ts`
// al cargar este módulo.
import './ia-capacidad-asistente-global.js';
import './ia-capacidad-redactar-presupuesto.js';

/**
 * Router único del núcleo de IA — `POST /generar` (parametrizado por
 * `capacidad`, nunca un endpoint por capacidad) y `POST /herramientas/ejecutar`
 * (confirma una propuesta de escritura pendiente).
 *
 * `POST /generar` es asíncrono (Fase 5): responde en milisegundos con un
 * `trabajoId` en vez de esperar a que Ollama/OpenAI terminen — el proxy de
 * desarrollo corta cualquier petición de más de ~3s, muy por debajo de lo
 * que tarda una respuesta real de Ollama en hardware sin GPU. El cliente
 * sondea `GET /generar/:trabajoId` hasta que el trabajo termina (ver
 * `ia-trabajos.ts`).
 *
 * Montado en `presupuestos-service.app-root.ts` bajo `/ia`, con
 * `requireAuth` ya aplicado por el llamante. Los límites de peticiones se
 * aplican aquí, por ruta: `limitadorIA` (estricto) en las que disparan una
 * generación real; `limitadorSondeoIA` (mucho más laxo) en el sondeo — ver
 * `rate-limit.middleware.ts` para el porqué de separarlos.
 */

function responderErrorIA(req: AuthRequest, res: express.Response, err: unknown): void {
  if (err instanceof ErrorProveedorInalcanzable) {
    res.status(503).json({ error: 'El servicio de IA no está disponible en este momento.' });
    return;
  }
  if (err instanceof ErrorCapacidadDesconocida || err instanceof ErrorPerfilNoDisponible || err instanceof ErrorProveedorDesconocido) {
    res.status(400).json({ error: err.message });
    return;
  }
  responderError(req, res, err);
}

export function crearRouterIA(): express.Router {
  const router = express.Router();
  const servicioCentralIA = ServicioCentralIA.from();

  router.post('/generar', limitadorIA, validar(esquemaGenerarIA), (req: AuthRequest, res) => {
    const { capacidad, mensajes, referencias } = req.body;
    const usuarioId = req.usuarioId!;
    const trabajoId = crearTrabajo(usuarioId);

    // Fire-and-forget a propósito: la petición HTTP no espera a que Ollama/OpenAI
    // terminen (puede tardar 30-90s en este hardware) — el resultado se
    // consulta con GET /generar/:trabajoId.
    servicioCentralIA.generar({ usuarioId, capacidad, mensajes, referencias, requestId: req.requestId })
      .then((resultado) => completarTrabajo(trabajoId, resultado))
      .catch((err) => fallarTrabajo(trabajoId, err instanceof Error ? err.message : String(err)));

    res.status(202).json({ trabajoId });
  });

  router.get('/generar/:trabajoId', limitadorSondeoIA, (req: AuthRequest, res) => {
    const trabajo = obtenerTrabajo(req.params.trabajoId, req.usuarioId!);
    if (!trabajo) { res.status(404).json({ error: 'Trabajo no encontrado.' }); return; }
    res.json({ estado: trabajo.estado, resultado: trabajo.resultado, error: trabajo.error });
  });

  router.post('/herramientas/ejecutar', limitadorIA, validar(esquemaEjecutarHerramientaIA), async (req: AuthRequest, res) => {
    try {
      const { capacidad: nombreCapacidad, nombre, argumentos, mensajesPrevios, referencias } = req.body;
      const capacidad = obtenerCapacidad(nombreCapacidad);
      const herramienta = capacidad.herramientas.find((h) => h.nombre === nombre);
      if (!herramienta) { res.status(404).json({ error: 'Herramienta no encontrada en esta capacidad.' }); return; }
      if (herramienta.permiso !== 'escritura') {
        res.status(403).json({ error: 'Esta herramienta no requiere confirmación explícita.' });
        return;
      }
      const parseo = herramienta.esquemaParametros.safeParse(argumentos);
      if (!parseo.success) {
        res.status(400).json({ error: 'Parámetros inválidos', detalles: parseo.error.issues });
        return;
      }

      // Ejecución real — escribe en Mongo a través de PresupuestosService, no
      // pasa por el modelo. Es una operación rápida (una escritura), no una
      // llamada a IA: no necesita el patrón asíncrono de /generar.
      const resultado = await herramienta.ejecutar(parseo.data, { usuarioId: req.usuarioId!, requestId: req.requestId ?? '' });

      // Segunda vuelta opcional: pedir al modelo que redacte la respuesta
      // final usando el resultado REAL de la escritura (no una plantilla
      // fija) — reinyectado como mensaje 'tool' de la misma conversación.
      // Es una llamada a IA, así que sí es asíncrona (mismo patrón que
      // /generar): se responde ya con el resultado real y un trabajoId para
      // sondear la redacción.
      let trabajoId: string | undefined;
      if (mensajesPrevios?.length) {
        trabajoId = crearTrabajo(req.usuarioId!);
        const mensajesConResultado = [
          ...mensajesPrevios,
          { role: 'assistant' as const, content: '' },
          { role: 'tool' as const, toolName: nombre, content: JSON.stringify(resultado) },
        ];
        servicioCentralIA.generar({
          usuarioId: req.usuarioId!, capacidad: nombreCapacidad, mensajes: mensajesConResultado,
          referencias, requestId: req.requestId,
        })
          .then((r) => completarTrabajo(trabajoId!, r))
          .catch((err) => fallarTrabajo(trabajoId!, err instanceof Error ? err.message : String(err)));
      }

      res.json({ ok: true, resultado, trabajoId });
    } catch (err) {
      responderErrorIA(req, res, err);
    }
  });

  return router;
}
