import { z } from 'zod';
import type { MensajeIA, DefinicionHerramienta, ResultadoGeneracion } from './ia-proveedor.js';
import { obtenerCapacidad } from './ia-registro-capacidades.js';
import { seleccionarModelo } from './ia-selector-modelo.js';
import { obtenerProveedor } from './ia-registro-proveedores.js';
import { registrarUsoIA } from './ia-uso.model.js';

/**
 * Orquestador único de IA. Ningún módulo debe llamar a un proveedor de IA
 * directamente — todo pasa por aquí: resuelve la capacidad (registro de
 * capacidades), la cadena de candidatos proveedor+modelo (selector de
 * modelo), construye el contexto y el prompt de esa capacidad, ejecuta el
 * bucle de function-calling respetando el permiso de cada herramienta, y
 * registra el uso siempre — cada intento fallido de la cadena de fallback,
 * y el resultado final, con éxito o con error.
 */

/** Tope de vueltas del bucle de function-calling — evita una cadena de llamadas sin fin por un uso anómalo del modelo. */
const MAX_ITERACIONES_HERRAMIENTAS = 3;

/** Una acción de navegación pura que el frontend debe ejecutar (herramienta de permiso `'interfaz'`). */
export type AccionInterfaz = { nombre: string; argumentos: Record<string, unknown> };

/** Una escritura propuesta por el modelo, pendiente de confirmación explícita del usuario. */
export type PropuestaEscritura = { id: string; nombre: string; argumentos: Record<string, unknown> };

export type ResultadoServicioCentral = {
  respuesta: string;
  accionesInterfaz: AccionInterfaz[];
  propuestas: PropuestaEscritura[];
};

export type ParametrosGenerarCentral = {
  usuarioId: string;
  capacidad: string;
  mensajes: MensajeIA[];
  referencias?: Record<string, unknown>;
  requestId?: string;
};

export class ServicioCentralIA {
  async generar(params: ParametrosGenerarCentral): Promise<ResultadoServicioCentral> {
    const inicio = Date.now();
    let proveedorNombre = '';
    let modeloNombre = '';
    let tokensEntrada = 0;
    let tokensSalida = 0;
    let iteraciones = 0;
    let intentoNumero = 1;
    let huboFallback = false;
    // `true` cuando el fallo final ya quedó registrado individualmente por
    // el último candidato probado en el bucle de fallback (ver más abajo)
    // — evita que el registro del `catch` externo duplique ese mismo fallo.
    let ultimoFalloYaRegistrado = false;
    const herramientasLlamadas: string[] = [];

    try {
      const capacidad = obtenerCapacidad(params.capacidad);
      // Cadena de candidatos proveedor+modelo, en el orden en que se
      // intentan (fallback) — no una única configuración resuelta.
      const candidatos = seleccionarModelo(capacidad.perfilModelo, capacidad.modelosPermitidos);

      const herramientasPorNombre = new Map(capacidad.herramientas.map((h) => [h.nombre, h]));
      const definicionesHerramientas: DefinicionHerramienta[] = capacidad.herramientas.map((h) => ({
        nombre: h.nombre,
        descripcion: h.descripcion,
        parametrosJsonSchema: z.toJSONSchema(h.esquemaParametros) as Record<string, unknown>,
      }));

      const contexto = await capacidad.constructorContexto.construir(params.referencias ?? {}, params.usuarioId);
      const promptSistema = typeof capacidad.promptSistema === 'function'
        ? capacidad.promptSistema(contexto)
        : capacidad.promptSistema;

      const conversacion: MensajeIA[] = [{ role: 'system', content: promptSistema }, ...params.mensajes];
      const accionesInterfaz: AccionInterfaz[] = [];
      const propuestas: PropuestaEscritura[] = [];
      let respuestaTexto = '';
      // `true` en cuanto un candidato responde con éxito en la primera
      // vuelta — a partir de ahí, el resto de iteraciones del bucle de
      // herramientas reutilizan ESE MISMO proveedor/modelo, sin volver a
      // recorrer la cadena de fallback (evita mezclar proveedores a mitad
      // de una conversación con `tool_call_id` generados por el otro).
      let primeraResolucionHecha = false;

      while (iteraciones < MAX_ITERACIONES_HERRAMIENTAS) {
        iteraciones++;
        let resultado: ResultadoGeneracion | undefined;

        if (primeraResolucionHecha) {
          resultado = await obtenerProveedor(proveedorNombre).generar({
            modelo: modeloNombre,
            mensajes: conversacion,
            herramientas: definicionesHerramientas.length ? definicionesHerramientas : undefined,
          });
        } else {
          let ultimoError: unknown;
          for (let i = 0; i < candidatos.length; i++) {
            const candidato = candidatos[i];
            intentoNumero = i + 1;
            proveedorNombre = candidato.proveedor;
            modeloNombre = candidato.modelo;
            try {
              resultado = await obtenerProveedor(candidato.proveedor).generar({
                modelo: candidato.modelo,
                mensajes: conversacion,
                herramientas: definicionesHerramientas.length ? definicionesHerramientas : undefined,
              });
              primeraResolucionHecha = true;
              huboFallback = i > 0;
              break;
            } catch (errCandidato) {
              ultimoError = errCandidato;
              await registrarUsoIA({
                usuarioId: params.usuarioId, capacidad: capacidad.nombre, proveedor: candidato.proveedor, modelo: candidato.modelo,
                tokensEntrada: 0, tokensSalida: 0, duracionMs: Date.now() - inicio, iteracionesHerramientas: iteraciones,
                herramientasLlamadas, exito: false,
                error: errCandidato instanceof Error ? errCandidato.message : String(errCandidato),
                requestId: params.requestId, intentoNumero,
              });
            }
          }
          if (!resultado) {
            // Se agotó la cadena: el último candidato ya quedó registrado
            // arriba, dentro del propio bucle — el `catch` externo no debe
            // volver a registrar el mismo fallo.
            ultimoFalloYaRegistrado = true;
            throw ultimoError;
          }
        }

        tokensEntrada += resultado.uso.tokensEntrada;
        tokensSalida += resultado.uso.tokensSalida;
        respuestaTexto = resultado.texto;

        if (!resultado.llamadasHerramientas.length) break;
        conversacion.push({ role: 'assistant', content: resultado.texto });

        let quedaPendienteReinyectar = false;
        for (const llamada of resultado.llamadasHerramientas) {
          const herramienta = herramientasPorNombre.get(llamada.nombre);
          if (!herramienta) continue;
          herramientasLlamadas.push(llamada.nombre);

          if (herramienta.permiso === 'interfaz') {
            accionesInterfaz.push({ nombre: llamada.nombre, argumentos: llamada.argumentos });
            continue;
          }
          if (herramienta.permiso === 'escritura') {
            propuestas.push({ id: llamada.id, nombre: llamada.nombre, argumentos: llamada.argumentos });
            continue;
          }

          // permiso 'lectura': se ejecuta en el mismo turno, siempre revalidando
          // los parámetros — nunca se confía en lo que "dice" el modelo que son.
          const parseo = herramienta.esquemaParametros.safeParse(llamada.argumentos);
          const resultadoEjecucion = parseo.success
            ? await herramienta.ejecutar(parseo.data, { usuarioId: params.usuarioId, requestId: params.requestId ?? '' })
            : { error: 'Parámetros inválidos para la herramienta ' + llamada.nombre };
          conversacion.push({ role: 'tool', toolCallId: llamada.id, toolName: llamada.nombre, content: JSON.stringify(resultadoEjecucion) });
          quedaPendienteReinyectar = true;
        }
        if (!quedaPendienteReinyectar) break;
      }

      await registrarUsoIA({
        usuarioId: params.usuarioId, capacidad: capacidad.nombre, proveedor: proveedorNombre, modelo: modeloNombre,
        tokensEntrada, tokensSalida, duracionMs: Date.now() - inicio, iteracionesHerramientas: iteraciones,
        herramientasLlamadas, exito: true, requestId: params.requestId, intentoNumero, huboFallback,
      });

      return { respuesta: respuestaTexto, accionesInterfaz, propuestas };
    } catch (err) {
      if (!ultimoFalloYaRegistrado) {
        await registrarUsoIA({
          usuarioId: params.usuarioId, capacidad: params.capacidad, proveedor: proveedorNombre, modelo: modeloNombre,
          tokensEntrada, tokensSalida, duracionMs: Date.now() - inicio, iteracionesHerramientas: iteraciones,
          herramientasLlamadas, exito: false, error: err instanceof Error ? err.message : String(err), requestId: params.requestId,
          intentoNumero, huboFallback,
        });
      }
      throw err;
    }
  }

  static from(): ServicioCentralIA {
    return new ServicioCentralIA();
  }
}
