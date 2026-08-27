import { defineConfig } from 'vitest/config';

/**
 * `cliente.model.ts`/`mongo-conexion.ts` usan UNA única conexión global de
 * Mongoose (`mongoose.connection`), no una por módulo — es el patrón real
 * de todo el backend, pensado para un único proceso de servidor, no para
 * tests en paralelo. Los specs que levantan su propio `MongoMemoryServer`
 * (`factura-seguridad.spec.ts`, `borrado-pendiente.spec.ts`) comparten esa
 * misma conexión global si vitest ejecuta varios archivos de test a la vez
 * en el mismo proceso — un archivo puede acabar leyendo/escribiendo en el
 * servidor en memoria de OTRO archivo, con resultados inconsistentes según
 * el orden real de ejecución (encontrado 27/08/2026: un mismo test pasaba
 * en solitario y fallaba al ejecutar la suite completa). `fileParallelism:
 * false` ejecuta los archivos de test uno detrás de otro — más lento, pero
 * es lo que exige compartir una única conexión global real.
 */
export default defineConfig({
  test: {
    fileParallelism: false,
  },
});
