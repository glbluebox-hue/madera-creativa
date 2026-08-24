import { reducirTutorial, estadoInicialTutorial, pasoActualDe, type DefinicionTutorial, type EstadoMotorTutorial } from './tutorial-motor.js';

const DEFINICION: DefinicionTutorial = {
  id: 'demo',
  titulo: 'Tutorial de prueba',
  pasos: [
    { id: 'p1', titulo: 'Paso 1', texto: 'Texto 1', targetId: 'obj-1', tipo: 'informativo' },
    { id: 'p2', titulo: 'Paso 2', texto: 'Texto 2', targetId: 'obj-2', tipo: 'interactivo' },
    { id: 'p3', titulo: 'Paso 3', texto: 'Texto 3', targetId: 'obj-3', tipo: 'informativo' },
  ],
};

describe('reducirTutorial — abrir tutorial', () => {
  it('1. Abrir sin pasoIndice empieza en el primer paso, en fase localizando', () => {
    const r = reducirTutorial(estadoInicialTutorial, { tipo: 'abrir', definicion: DEFINICION });
    expect(r).toEqual({ fase: 'localizando', definicion: DEFINICION, pasoIndice: 0 });
  });

  it('2. Abrir con un pasoIndice guardado reanuda exactamente en ese paso (continuar tutorial)', () => {
    const r = reducirTutorial(estadoInicialTutorial, { tipo: 'abrir', definicion: DEFINICION, pasoIndice: 1 });
    expect(r).toEqual({ fase: 'localizando', definicion: DEFINICION, pasoIndice: 1 });
  });

  it('3. Abrir con un pasoIndice fuera de rango (tutorial acortado en una versión nueva) se trata como completado, no como error', () => {
    const r = reducirTutorial(estadoInicialTutorial, { tipo: 'abrir', definicion: DEFINICION, pasoIndice: 99 });
    expect(r).toEqual({ fase: 'completado', definicion: DEFINICION, pasoIndice: 2 });
  });
});

describe('reducirTutorial — objetivo que todavía no existe / reintento', () => {
  it('4. En fase localizando, "objetivoLocalizado" pasa a mostrandoPaso', () => {
    const localizando = reducirTutorial(estadoInicialTutorial, { tipo: 'abrir', definicion: DEFINICION });
    const r = reducirTutorial(localizando, { tipo: 'objetivoLocalizado' });
    expect(r).toEqual({ fase: 'mostrandoPaso', definicion: DEFINICION, pasoIndice: 0 });
  });

  it('5. "objetivoLocalizado" fuera de fase localizando no hace nada (ej. sin tutorial abierto)', () => {
    const r = reducirTutorial(estadoInicialTutorial, { tipo: 'objetivoLocalizado' });
    expect(r).toEqual(estadoInicialTutorial);
  });

  it('6. Mientras el objetivo no aparece, el estado se queda en localizando indefinidamente sin ninguna acción explícita de "no encontrado" — no hay forma de que el motor avance solo', () => {
    const localizando = reducirTutorial(estadoInicialTutorial, { tipo: 'abrir', definicion: DEFINICION });
    // Ninguna acción real llega mientras el overlay sigue buscando — el estado no cambia por sí solo.
    expect(localizando.fase).toBe('localizando');
  });
});

describe('reducirTutorial — pasos informativos: avanzar/retroceder', () => {
  function enPasoUno(): EstadoMotorTutorial {
    const localizando = reducirTutorial(estadoInicialTutorial, { tipo: 'abrir', definicion: DEFINICION });
    return reducirTutorial(localizando, { tipo: 'objetivoLocalizado' });
  }

  it('7. "avanzar" desde mostrandoPaso pasa al siguiente paso, en fase localizando de nuevo', () => {
    const r = reducirTutorial(enPasoUno(), { tipo: 'avanzar' });
    expect(r).toEqual({ fase: 'localizando', definicion: DEFINICION, pasoIndice: 1 });
  });

  it('8. "avanzar" en fase localizando (objetivo todavía no confirmado) no hace nada — no se puede saltar un paso sin haberlo mostrado', () => {
    const localizando = reducirTutorial(estadoInicialTutorial, { tipo: 'abrir', definicion: DEFINICION });
    const r = reducirTutorial(localizando, { tipo: 'avanzar' });
    expect(r).toEqual(localizando);
  });

  it('9. "avanzar" en el último paso completa el tutorial', () => {
    let estado = enPasoUno();
    estado = reducirTutorial(estado, { tipo: 'avanzar' }); // -> localizando paso 2
    estado = reducirTutorial(estado, { tipo: 'objetivoLocalizado' }); // -> mostrandoPaso paso 2
    estado = reducirTutorial(estado, { tipo: 'avanzar' }); // -> localizando paso 3 (último)
    estado = reducirTutorial(estado, { tipo: 'objetivoLocalizado' }); // -> mostrandoPaso paso 3
    const r = reducirTutorial(estado, { tipo: 'avanzar' });
    expect(r).toEqual({ fase: 'completado', definicion: DEFINICION, pasoIndice: 2 });
  });

  it('10. "retroceder" desde mostrandoPaso vuelve al paso anterior, en fase localizando', () => {
    let estado = enPasoUno();
    estado = reducirTutorial(estado, { tipo: 'avanzar' });
    estado = reducirTutorial(estado, { tipo: 'objetivoLocalizado' }); // paso 2, mostrado
    const r = reducirTutorial(estado, { tipo: 'retroceder' });
    expect(r).toEqual({ fase: 'localizando', definicion: DEFINICION, pasoIndice: 0 });
  });

  it('11. "retroceder" en el primer paso no hace nada (no existe un paso -1)', () => {
    const estado = enPasoUno();
    const r = reducirTutorial(estado, { tipo: 'retroceder' });
    expect(r).toEqual(estado);
  });

  it('12. "retroceder" también funciona en fase localizando (arrepentirse antes de que aparezca el objetivo)', () => {
    let estado = enPasoUno();
    estado = reducirTutorial(estado, { tipo: 'avanzar' }); // -> localizando paso 2, sin haberlo mostrado todavía
    const r = reducirTutorial(estado, { tipo: 'retroceder' });
    expect(r).toEqual({ fase: 'localizando', definicion: DEFINICION, pasoIndice: 0 });
  });
});

describe('reducirTutorial — pasos interactivos: esperar una acción real del usuario', () => {
  function enPasoDosInteractivoMostrado(): EstadoMotorTutorial {
    let estado = reducirTutorial(estadoInicialTutorial, { tipo: 'abrir', definicion: DEFINICION, pasoIndice: 1 });
    estado = reducirTutorial(estado, { tipo: 'objetivoLocalizado' });
    return estado;
  }

  it('13. "accionDetectada" en un paso interactivo mostrado avanza al siguiente paso', () => {
    const r = reducirTutorial(enPasoDosInteractivoMostrado(), { tipo: 'accionDetectada' });
    expect(r).toEqual({ fase: 'localizando', definicion: DEFINICION, pasoIndice: 2 });
  });

  it('14. "accionDetectada" en un paso INFORMATIVO se ignora — el clic del usuario en el elemento señalado no debe saltar un paso pensado para leer', () => {
    const localizando = reducirTutorial(estadoInicialTutorial, { tipo: 'abrir', definicion: DEFINICION });
    const mostrando = reducirTutorial(localizando, { tipo: 'objetivoLocalizado' }); // paso 1, informativo
    const r = reducirTutorial(mostrando, { tipo: 'accionDetectada' });
    expect(r).toEqual(mostrando);
  });

  it('15. "accionDetectada" mientras el objetivo todavía no se ha confirmado (fase localizando) se ignora — nunca se avanza sin haber mostrado el paso', () => {
    const localizando = reducirTutorial(estadoInicialTutorial, { tipo: 'abrir', definicion: DEFINICION, pasoIndice: 1 });
    const r = reducirTutorial(localizando, { tipo: 'accionDetectada' });
    expect(r).toEqual(localizando);
  });
});

describe('reducirTutorial — cerrar', () => {
  it('16. "cerrar" vuelve a inactivo desde cualquier fase', () => {
    for (const estado of [
      reducirTutorial(estadoInicialTutorial, { tipo: 'abrir', definicion: DEFINICION }),
      reducirTutorial(reducirTutorial(estadoInicialTutorial, { tipo: 'abrir', definicion: DEFINICION }), { tipo: 'objetivoLocalizado' }),
      reducirTutorial(estadoInicialTutorial, { tipo: 'abrir', definicion: DEFINICION, pasoIndice: 99 }), // completado
    ]) {
      expect(reducirTutorial(estado, { tipo: 'cerrar' })).toEqual({ fase: 'inactivo' });
    }
  });

  it('17. "cerrar" sobre "inactivo" se queda en inactivo, sin romper nada', () => {
    expect(reducirTutorial(estadoInicialTutorial, { tipo: 'cerrar' })).toEqual({ fase: 'inactivo' });
  });
});

describe('reducirTutorial — no queda estado "sucio" entre aperturas (mismo patrón que estadoInicialPanelIA)', () => {
  it('18. Completar un tutorial y volver a abrirlo desde el principio funciona igual, sin arrastrar nada de la vez anterior', () => {
    let primeraVez = reducirTutorial(estadoInicialTutorial, { tipo: 'abrir', definicion: DEFINICION });
    primeraVez = reducirTutorial(primeraVez, { tipo: 'objetivoLocalizado' });
    primeraVez = reducirTutorial(primeraVez, { tipo: 'avanzar' });
    expect(primeraVez).toMatchObject({ pasoIndice: 1 });

    // estadoInicialTutorial no se muta — una segunda apertura desde cero es idéntica a la primera.
    expect(estadoInicialTutorial).toEqual({ fase: 'inactivo' });
    const segundaVez = reducirTutorial(estadoInicialTutorial, { tipo: 'abrir', definicion: DEFINICION });
    expect(segundaVez).toEqual({ fase: 'localizando', definicion: DEFINICION, pasoIndice: 0 });
  });
});

describe('pasoActualDe', () => {
  it('19. Sin tutorial activo, devuelve null', () => {
    expect(pasoActualDe(estadoInicialTutorial)).toBeNull();
  });

  it('20. Con un tutorial activo, devuelve el paso correspondiente al índice actual', () => {
    const estado = reducirTutorial(estadoInicialTutorial, { tipo: 'abrir', definicion: DEFINICION, pasoIndice: 1 });
    expect(pasoActualDe(estado)).toEqual(DEFINICION.pasos[1]);
  });

  it('21. En fase completado, sigue devolviendo el último paso mostrado (útil para un resumen final)', () => {
    const estado = reducirTutorial(estadoInicialTutorial, { tipo: 'abrir', definicion: DEFINICION, pasoIndice: 99 });
    expect(estado.fase).toBe('completado');
    expect(pasoActualDe(estado)).toEqual(DEFINICION.pasos[2]);
  });
});

describe('reducirTutorial — navegación entre secciones y menú móvil (solo datos, el motor no navega por sí mismo)', () => {
  it('22. Un paso con seccionRequerida solo expone el dato — el motor no lo interpreta ni navega solo', () => {
    const conSeccion: DefinicionTutorial = {
      id: 'demo2', titulo: 'Demo 2',
      pasos: [{ id: 'x', titulo: 'X', texto: 'X', targetId: 'obj-x', tipo: 'informativo', seccionRequerida: 'clientes', requiereMenuMovil: true }],
    };
    const estado = reducirTutorial(estadoInicialTutorial, { tipo: 'abrir', definicion: conSeccion });
    expect(pasoActualDe(estado)?.seccionRequerida).toBe('clientes');
    expect(pasoActualDe(estado)?.requiereMenuMovil).toBe(true);
    // El motor no añade ni quita fases por tener estos campos — sigue siendo una simple espera en "localizando".
    expect(estado.fase).toBe('localizando');
  });
});
