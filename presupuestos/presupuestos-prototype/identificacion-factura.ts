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

/**
 * Proveedor ya dado de alta por este usuario (ficha creada a partir de al
 * menos una factura de gasto real anterior — ver `proveedor-utils.ts`).
 * Solo se necesitan estos dos campos para usarlo como evidencia de
 * identificación (bloque 2.5 de `resolverInterno`).
 */
export type ProveedorConocido = {
  nombre: string;
  cifNif?: string | null;
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

/** Coinciden dos palabras — iguales, o una es prefijo de la otra con longitud suficiente. Tolera truncados reales de impresión/OCR (p. ej. "RANDAZZ" en vez de "RANDAZZO" — bug reportado 27/08/2026, ticket con el apellido cortado en la etiqueta de envío). */
function palabrasCoinciden(a: string, b: string): boolean {
  if (a === b) return true;
  const [corta, larga] = a.length <= b.length ? [a, b] : [b, a];
  return corta.length >= 4 && larga.startsWith(corta);
}

/**
 * Coinciden dos nombres — igualdad, inclusión en cualquier dirección
 * (nombres comerciales suelen llevar "S.L."/"Autónomo" de más), o las
 * mismas palabras (toleradas truncamientos cortos) en otro orden,
 * EXIGIENDO el mismo número de palabras en los dos nombres.
 *
 * Esa última regla es real, no teórica (bug reportado 27/08/2026): el
 * titular guardado en Ajustes de empresa era "Luca Randazzo", pero el
 * documento (formato "Apellido Nombre", habitual en facturas de
 * proveedores extranjeros, y con el apellido cortado a "Randazz") traía
 * "Randazz Luca" — ninguna cadena es substring literal de la otra, así que
 * la comparación de antes nunca lo reconocía como el titular. Exigir el
 * MISMO número de palabras (en vez de aceptar que unas pocas palabras
 * compartidas basten) es igual de importante: sin eso, un cliente real
 * llamado solo "Juan Pérez" habría coincidido por error con el titular
 * "Juan García Pérez", que no es la misma persona.
 */
export function nombresCoinciden(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizarNombre(a);
  const nb = normalizarNombre(b);
  if (na.length < 3 || nb.length < 3) return false;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;

  const palabrasA = na.split(' ').filter((p) => p.length > 1);
  const palabrasB = nb.split(' ').filter((p) => p.length > 1);
  // Al menos 2 palabras significativas, y las mismas en los dos nombres —
  // ver comentario de arriba.
  if (palabrasA.length < 2 || palabrasA.length !== palabrasB.length) return false;

  const usadas = new Set<number>();
  return palabrasA.every((pa) => {
    const i = palabrasB.findIndex((pb, idx) => !usadas.has(idx) && palabrasCoinciden(pa, pb));
    if (i === -1) return false;
    usadas.add(i);
    return true;
  });
}

/**
 * Punto de entrada público — aplica toda la lógica de `resolverInterno` y
 * luego una última red de seguridad (ver su comentario) antes de devolver
 * el resultado. Mantener la lógica real en una función aparte permite que
 * esa red de seguridad cubra los CUATRO bloques de más abajo a la vez, sin
 * tener que repetir la comprobación en cada `return`.
 */
export function resolverEmisorReceptor(
  datos: DatosExtraidosFactura,
  empresa: EmpresaIdentificacion,
  proveedoresConocidos: ProveedorConocido[] = []
): ResultadoIdentificacion {
  let resultado = resolverInterno(datos, empresa, proveedoresConocidos);

  // Red de seguridad final (petición explícita del usuario, 27/08/2026,
  // caso real: el CIF de MONTÓ estaba escrito en letra tan pequeña que la
  // IA no llegó ni a leerlo, y el documento no dio ninguna otra evidencia
  // fuerte — el resultado acabó siendo el propio NIF del usuario puesto
  // como si fuera el del proveedor). Decida lo que decida la lógica de
  // arriba, el CIF/NIF de "la otra parte" NUNCA puede ser el nuestro
  // propio — si ocurre, es preferible decir "no detectado, revisa a mano"
  // que enseñar el NIF del propio usuario como si fuera el del
  // proveedor/cliente. No se toca `confianza`: quién es la otra parte
  // (`proveedor`/`tipo`) puede seguir estando bien identificado por
  // nombre aunque su CIF concreto no se pueda mostrar — solo se obliga a
  // `revisar: true`, porque un dato fiscal que antes se enseñaba (aunque
  // fuera incorrecto) ahora se calla, y el usuario debe rellenarlo a mano
  // si lo necesita.
  if (empresa.nifCif && nifsCoinciden(resultado.cifNif, empresa.nifCif)) {
    resultado = { ...resultado, cifNif: '', revisar: true };
  }

  // Segunda red de seguridad, simétrica a la de arriba pero para el NOMBRE
  // (bug real de producción, 25/09/2026: una factura de Leroy Merlin —
  // proveedor de gasto real, ya dado de alta con su propio CIF guardado —
  // se guardó con `proveedor` igual al propio titular de la empresa y
  // `tipo:'ingreso'` en vez de `'gasto'`; el documento debió traer
  // impreso, en algún campo que la IA leyó como la otra parte, el nombre
  // del propio titular — p. ej. un pedido/recogida en tienda hecho a su
  // nombre — y la red de seguridad de arriba, al mirar solo el CIF/NIF,
  // nunca lo detectó). El proveedor/cliente de una factura JAMÁS puede ser
  // la propia empresa: si el nombre resuelto coincide con el nombre
  // comercial o el titular, ni ese nombre ni el `tipo` derivado de la
  // misma asignación son fiables — se vacían los dos (a diferencia del
  // caso del CIF, aquí SÍ se toca `tipo`, porque fue precisamente esa
  // asignación errónea de quién es quién la que lo puso al revés) y se
  // exige revisión manual.
  if (
    resultado.proveedor &&
    ((empresa.nombre && nombresCoinciden(resultado.proveedor, empresa.nombre)) ||
      (empresa.titular && nombresCoinciden(resultado.proveedor, empresa.titular)))
  ) {
    resultado = { ...resultado, proveedor: '', tipo: null, revisar: true };
  }

  return resultado;
}

function resolverInterno(
  datos: DatosExtraidosFactura,
  empresa: EmpresaIdentificacion,
  proveedoresConocidos: ProveedorConocido[]
): ResultadoIdentificacion {
  const emisorEsEmpresaPorNif = empresa.nifCif ? nifsCoinciden(datos.emisorCifNif, empresa.nifCif) : false;
  const receptorEsEmpresaPorNif = empresa.nifCif ? nifsCoinciden(datos.receptorCifNif, empresa.nifCif) : false;

  // Se calcula ya aquí (no solo como fallback más abajo) porque el CIF/NIF
  // por sí solo NO basta si el nombre del lado contrario contradice
  // directamente al CIF — ver el bloque 1.
  const emisorEsEmpresaPorNombre =
    (empresa.nombre && nombresCoinciden(datos.emisorNombre, empresa.nombre)) ||
    (empresa.titular && nombresCoinciden(datos.emisorNombre, empresa.titular)) || false;
  const receptorEsEmpresaPorNombre =
    (empresa.nombre && nombresCoinciden(datos.receptorNombre, empresa.nombre)) ||
    (empresa.titular && nombresCoinciden(datos.receptorNombre, empresa.titular)) || false;

  // 1) Evidencia fuerte por CIF/NIF — solo decide si coincide con
  //    exactamente uno de los dos lados Y el nombre del lado contrario no
  //    lo contradice. Bug real (27/08/2026): en un ticket con formato
  //    confuso, la IA asoció el CIF/NIF del usuario al campo "emisor" en
  //    vez de al "receptor" (donde realmente aparecía, junto a la
  //    dirección de envío) — pero el NOMBRE del receptor sí era
  //    inequívocamente el titular. Confiar ciegamente en el CIF sin mirar
  //    el nombre clasificó un gasto real como ingreso, con el propio
  //    titular puesto de proveedor. Cuando CIF y nombre se contradicen así,
  //    el documento es demasiado confuso para decidir con confianza alta
  //    — se trata como si el CIF no hubiera coincidido, y se cae al
  //    bloque 2 (por nombre) o al 3 (revisión obligatoria).
  if (emisorEsEmpresaPorNif && !receptorEsEmpresaPorNif && !receptorEsEmpresaPorNombre) {
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
  if (receptorEsEmpresaPorNif && !emisorEsEmpresaPorNif && !emisorEsEmpresaPorNombre) {
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

  // 2) Sin evidencia concluyente por NIF (ninguno coincide, coinciden los
  //    dos a la vez, o contradice al nombre del lado contrario): probar
  //    por nombre, confianza media — contra el nombre comercial O el
  //    nombre y apellidos del titular (una factura de ingreso real suele
  //    llevar el nombre legal, no la marca; hallazgo real, 25/08/2026).
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

  // 2.5) Evidencia por proveedor ya conocido (bug real de producción,
  //      05/10/2026: una factura de Leroy Merlin —proveedor de gasto ya
  //      dado de alta con su propio CIF guardado— caía en el bloque 3
  //      porque ni su nombre ni su CIF coinciden con los de la EMPRESA (es
  //      un tercero, no la propia empresa, así que los bloques 1 y 2 nunca
  //      se disparan) y la IA adivinaba `tipo:'ingreso'`; el bloque 3
  //      entonces descartaba el nombre real —`emisorNombre`, bien leído—
  //      y usaba `receptorNombre` (vacío en un ticket de caja), perdiendo
  //      a la vez el tipo y el proveedor. Que un nombre o CIF coincida con
  //      un proveedor YA REGISTRADO es un hecho objetivo, no una
  //      suposición —una ficha de proveedor solo se crea a partir de una
  //      factura de gasto real anterior (`proveedor-utils.ts`)— así que
  //      esta evidencia se usa ANTES del fallback ciego del bloque 3.
  //      Un proveedor conocido es siempre del lado del GASTO: si el nombre
  //      coincide, esa factura es un gasto con ese proveedor como emisor,
  //      sea cual sea el campo del documento donde la IA lo haya colocado.
  const emisorEsProveedorPorNif = datos.emisorCifNif
    ? proveedoresConocidos.some((p) => nifsCoinciden(datos.emisorCifNif, p.cifNif))
    : false;
  const receptorEsProveedorPorNif = datos.receptorCifNif
    ? proveedoresConocidos.some((p) => nifsCoinciden(datos.receptorCifNif, p.cifNif))
    : false;
  const emisorEsProveedorPorNombre = proveedoresConocidos.some((p) => nombresCoinciden(datos.emisorNombre, p.nombre));
  const receptorEsProveedorPorNombre = proveedoresConocidos.some((p) => nombresCoinciden(datos.receptorNombre, p.nombre));
  const emisorEsProveedorConocido = emisorEsProveedorPorNif || emisorEsProveedorPorNombre;
  const receptorEsProveedorConocido = receptorEsProveedorPorNif || receptorEsProveedorPorNombre;

  // Si coinciden los dos lados a la vez (dos proveedores distintos
  // mencionados en el mismo documento — caso raro pero posible) es
  // ambiguo: no se inventa cuál es el real, se cae al bloque 3.
  if (emisorEsProveedorConocido && !receptorEsProveedorConocido) {
    return {
      tipo: 'gasto',
      proveedor: datos.emisorNombre ?? '',
      cifNif: datos.emisorCifNif ?? '',
      direccion: datos.emisorDireccion ?? '',
      codigoPostal: datos.emisorCodigoPostal ?? '',
      confianza: emisorEsProveedorPorNif ? 'alta' : 'media',
      revisar: !datos.emisorNombre,
    };
  }
  if (receptorEsProveedorConocido && !emisorEsProveedorConocido) {
    return {
      tipo: 'gasto',
      proveedor: datos.receptorNombre ?? '',
      cifNif: datos.receptorCifNif ?? '',
      direccion: datos.receptorDireccion ?? '',
      codigoPostal: datos.receptorCodigoPostal ?? '',
      confianza: receptorEsProveedorPorNif ? 'alta' : 'media',
      revisar: !datos.receptorNombre,
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
