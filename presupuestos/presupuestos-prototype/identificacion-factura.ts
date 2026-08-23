/**
 * Resolución determinista de emisor/receptor de una factura escaneada
 * (auditoría 23/08/2026). Antes, el escáner asignaba directamente al campo
 * `proveedor` de la factura lo que la IA devolvía en su propio campo
 * `proveedor`, sin ninguna verificación — con el riesgo real de que la IA
 * confundiera quién es Madera Creativa y quién es la otra parte,
 * especialmente en facturas de INGRESO (donde Madera Creativa es la
 * emisora, no la receptora).
 *
 * Esta función es pura (sin `fetch`, sin estado, sin efectos secundarios)
 * a propósito, para poder testear las reglas de negocio sin red ni mocks:
 * la IA ahora solo describe el documento (quién emite, quién recibe, con
 * su nombre y CIF/NIF si constan) y esta función decide, con datos
 * objetivos, qué va en `Factura.proveedor`/`Factura.cifNif` y si el
 * `tipo` (ingreso/gasto) es fiable.
 *
 * Regla de oro: nunca inventar. Si no hay evidencia suficiente, se marca
 * `revisar: true` y `confianza: 'baja'` en vez de adivinar.
 */

/** Lo que la IA devuelve sobre las dos partes del documento — ver `ia-prompt-extraer-factura.ts`. */
export type DatosExtraidosFactura = {
  emisorNombre: string | null;
  emisorCifNif: string | null;
  receptorNombre: string | null;
  receptorCifNif: string | null;
  /** Estimación de la propia IA — una pista, no una verdad absoluta: si contradice un NIF verificado, gana el NIF. */
  tipo: 'ingreso' | 'gasto' | null;
};

/** Datos fiscales propios ya configurados en Ajustes de empresa. */
export type EmpresaIdentificacion = {
  nombre: string;
  nifCif: string;
};

export type ResultadoIdentificacion = {
  /** Va directo a `Factura.proveedor` — el cliente si es ingreso, el proveedor real si es gasto. */
  proveedor: string;
  /** Va directo a `Factura.cifNif` — el CIF/NIF de esa misma parte, nunca el de Madera Creativa. */
  cifNif: string;
  tipo: 'ingreso' | 'gasto' | null;
  confianza: 'alta' | 'media' | 'baja';
  /** true si no hay evidencia suficiente y el usuario debe revisar antes de guardar. */
  revisar: boolean;
};

/** Deja solo dígitos y letras en mayúsculas — para comparar CIF/NIF sin que espacios, guiones o minúsculas cuenten como diferencia. */
function normalizarNif(nif: string | null | undefined): string {
  return (nif ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Minúsculas, sin acentos ni puntuación, espacios colapsados — para comparar nombres de forma tolerante. */
function normalizarNombre(nombre: string | null | undefined): string {
  return (nombre ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Coinciden dos NIF/CIF — exige una longitud mínima para no dar por buena una coincidencia de un fragmento demasiado corto/ilegible. */
function nifsCoinciden(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizarNif(a);
  const nb = normalizarNif(b);
  return na.length >= 5 && na === nb;
}

/** Coinciden dos nombres — igualdad o inclusión en cualquier dirección (nombres comerciales suelen llevar "S.L."/"Autónomo" de más). */
function nombresCoinciden(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizarNombre(a);
  const nb = normalizarNombre(b);
  if (na.length < 3 || nb.length < 3) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

export function resolverEmisorReceptor(datos: DatosExtraidosFactura, empresa: EmpresaIdentificacion): ResultadoIdentificacion {
  // 1) Evidencia fuerte por CIF/NIF — solo decide si coincide con exactamente uno de los dos lados.
  const emisorEsEmpresaPorNif = empresa.nifCif ? nifsCoinciden(datos.emisorCifNif, empresa.nifCif) : false;
  const receptorEsEmpresaPorNif = empresa.nifCif ? nifsCoinciden(datos.receptorCifNif, empresa.nifCif) : false;

  if (emisorEsEmpresaPorNif && !receptorEsEmpresaPorNif) {
    return {
      tipo: 'ingreso',
      proveedor: datos.receptorNombre ?? '',
      cifNif: datos.receptorCifNif ?? '',
      confianza: 'alta',
      revisar: !datos.receptorNombre,
    };
  }
  if (receptorEsEmpresaPorNif && !emisorEsEmpresaPorNif) {
    return {
      tipo: 'gasto',
      proveedor: datos.emisorNombre ?? '',
      cifNif: datos.emisorCifNif ?? '',
      confianza: 'alta',
      revisar: !datos.emisorNombre,
    };
  }

  // 2) Sin evidencia concluyente por NIF (ninguno coincide, o coinciden los
  //    dos a la vez — documento raro/erróneo): probar por nombre, confianza media.
  const emisorEsEmpresaPorNombre = empresa.nombre ? nombresCoinciden(datos.emisorNombre, empresa.nombre) : false;
  const receptorEsEmpresaPorNombre = empresa.nombre ? nombresCoinciden(datos.receptorNombre, empresa.nombre) : false;

  if (emisorEsEmpresaPorNombre && !receptorEsEmpresaPorNombre) {
    return {
      tipo: 'ingreso',
      proveedor: datos.receptorNombre ?? '',
      cifNif: datos.receptorCifNif ?? '',
      confianza: 'media',
      revisar: !datos.receptorNombre,
    };
  }
  if (receptorEsEmpresaPorNombre && !emisorEsEmpresaPorNombre) {
    return {
      tipo: 'gasto',
      proveedor: datos.emisorNombre ?? '',
      cifNif: datos.emisorCifNif ?? '',
      confianza: 'media',
      revisar: !datos.emisorNombre,
    };
  }

  // 3) Sin evidencia objetiva de ningún tipo: no se inventa nada. Se
  //    conserva el `tipo` que proponía la IA (si lo dio) solo para no
  //    perder esa pista, pero SIEMPRE con confianza baja y revisión obligatoria.
  const tipo = datos.tipo;
  let proveedor = '';
  let cifNif = '';
  if (tipo === 'ingreso') { proveedor = datos.receptorNombre ?? ''; cifNif = datos.receptorCifNif ?? ''; }
  else if (tipo === 'gasto') { proveedor = datos.emisorNombre ?? ''; cifNif = datos.emisorCifNif ?? ''; }
  return { tipo, proveedor, cifNif, confianza: 'baja', revisar: true };
}
