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
  /** Dirección del emisor tal como consta en el documento — para completar en automático la ficha del proveedor al guardar un gasto (27/08/2026). */
  emisorDireccion: string | null;
  emisorCodigoPostal: string | null;
  receptorNombre: string | null;
  receptorCifNif: string | null;
  receptorDireccion: string | null;
  receptorCodigoPostal: string | null;
  /** Estimación de la propia IA — una pista, no una verdad absoluta: si contradice un NIF verificado, gana el NIF. */
  tipo: 'ingreso' | 'gasto' | null;
};

/** Datos fiscales propios ya configurados en Ajustes de empresa. */
export type EmpresaIdentificacion = {
  nombre: string;
  /** Nombre y apellidos del titular real (autónomo) — una factura de ingreso real suele llevar este nombre, no el comercial. Vacío si no se ha configurado. */
  titular: string;
  nifCif: string;
};

export type ResultadoIdentificacion = {
  /** Va directo a `Factura.proveedor` — el cliente si es ingreso, el proveedor real si es gasto. */
  proveedor: string;
  /** Va directo a `Factura.cifNif` — el CIF/NIF de esa misma parte, nunca el de Madera Creativa. */
  cifNif: string;
  /** Dirección de esa misma parte (nunca la de Madera Creativa) — usada solo para completar en automático la ficha del proveedor al guardar un gasto, no se guarda en la propia Factura. */
  direccion: string;
  /** Código postal de esa misma parte, mismo criterio que `direccion`. */
  codigoPostal: string;
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
export function normalizarNombre(nombre: string | null | undefined): string {
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

/**
 * Coinciden dos nombres — igualdad, inclusión en cualquier dirección
 * (nombres comerciales suelen llevar "S.L."/"Autónomo" de más), o las
 * mismas palabras en otro orden.
 *
 * Ese último caso es real, no teórico (bug reportado 27/08/2026): el
 * titular guardado en Ajustes de empresa era "Luca Randazzo", pero el
 * documento (formato "Apellido Nombre", habitual en facturas de
 * proveedores extranjeros) traía "Randazzo Luca" — ninguna de las dos
 * cadenas es substring literal de la otra, así que la comparación de antes
 * nunca reconocía al titular como una de las partes, y la factura se
 * clasificaba como ingreso con el propio titular puesto de proveedor.
 */
export function nombresCoinciden(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizarNombre(a);
  const nb = normalizarNombre(b);
  if (na.length < 3 || nb.length < 3) return false;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;

  const palabrasA = new Set(na.split(' ').filter((p) => p.length > 1));
  const palabrasB = new Set(nb.split(' ').filter((p) => p.length > 1));
  // Exige al menos 2 palabras significativas en cada nombre — con una sola
  // (p. ej. "Juan" contra "Juan Carlos Maderas S.L.") el riesgo de falso
  // positivo es demasiado alto para decidir algo tan sensible como quién
  // es Madera Creativa en la factura.
  if (palabrasA.size < 2 || palabrasB.size < 2) return false;
  const [menor, mayor] = palabrasA.size <= palabrasB.size ? [palabrasA, palabrasB] : [palabrasB, palabrasA];
  return [...menor].every((p) => mayor.has(p));
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
      direccion: datos.receptorDireccion ?? '',
      codigoPostal: datos.receptorCodigoPostal ?? '',
      confianza: 'alta',
      revisar: !datos.receptorNombre,
    };
  }
  if (receptorEsEmpresaPorNif && !emisorEsEmpresaPorNif) {
    return {
      tipo: 'gasto',
      proveedor: datos.emisorNombre ?? '',
      cifNif: datos.emisorCifNif ?? '',
      direccion: datos.emisorDireccion ?? '',
      codigoPostal: datos.emisorCodigoPostal ?? '',
      confianza: 'alta',
      revisar: !datos.emisorNombre,
    };
  }

  // 2) Sin evidencia concluyente por NIF (ninguno coincide, o coinciden los
  //    dos a la vez — documento raro/erróneo): probar por nombre, confianza
  //    media — contra el nombre comercial O el nombre y apellidos del
  //    titular (una factura de ingreso real suele llevar el nombre legal,
  //    no la marca; hallazgo real, 25/08/2026).
  const emisorEsEmpresaPorNombre =
    (empresa.nombre && nombresCoinciden(datos.emisorNombre, empresa.nombre)) ||
    (empresa.titular && nombresCoinciden(datos.emisorNombre, empresa.titular)) || false;
  const receptorEsEmpresaPorNombre =
    (empresa.nombre && nombresCoinciden(datos.receptorNombre, empresa.nombre)) ||
    (empresa.titular && nombresCoinciden(datos.receptorNombre, empresa.titular)) || false;

  if (emisorEsEmpresaPorNombre && !receptorEsEmpresaPorNombre) {
    return {
      tipo: 'ingreso',
      proveedor: datos.receptorNombre ?? '',
      cifNif: datos.receptorCifNif ?? '',
      direccion: datos.receptorDireccion ?? '',
      codigoPostal: datos.receptorCodigoPostal ?? '',
      confianza: 'media',
      revisar: !datos.receptorNombre,
    };
  }
  if (receptorEsEmpresaPorNombre && !emisorEsEmpresaPorNombre) {
    return {
      tipo: 'gasto',
      proveedor: datos.emisorNombre ?? '',
      cifNif: datos.emisorCifNif ?? '',
      direccion: datos.emisorDireccion ?? '',
      codigoPostal: datos.emisorCodigoPostal ?? '',
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
  let direccion = '';
  let codigoPostal = '';
  if (tipo === 'ingreso') {
    proveedor = datos.receptorNombre ?? ''; cifNif = datos.receptorCifNif ?? '';
    direccion = datos.receptorDireccion ?? ''; codigoPostal = datos.receptorCodigoPostal ?? '';
  } else if (tipo === 'gasto') {
    proveedor = datos.emisorNombre ?? ''; cifNif = datos.emisorCifNif ?? '';
    direccion = datos.emisorDireccion ?? ''; codigoPostal = datos.emisorCodigoPostal ?? '';
  }
  return { tipo, proveedor, cifNif, direccion, codigoPostal, confianza: 'baja', revisar: true };
}
