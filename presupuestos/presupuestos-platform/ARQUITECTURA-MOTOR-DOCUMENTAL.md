# Arquitectura del Motor Documental de Madera Creativa

**Estado**: **arquitectura cerrada y aprobada — documento de referencia oficial del sistema.** Cualquier cambio futuro al diseño aquí descrito pasa por una revisión explícita, no por una implementación que lo contradiga en silencio. Ninguna línea de código escrita todavía; la implementación empieza en el Incremento 1, siguiendo el ciclo de la metodología del proyecto (auditoría → propuesta → implementación → pruebas reales → informe → checkpoint).

**Decisiones ya aprobadas** (no se reabren):
- `DocumentoMC` como formato propio, guardado en MongoDB — nunca el formato interno de una librería de render.
- Render mediante DOM + React.
- `react-moveable` para mover, seleccionar, rotar, agrupar y redimensionar.
- El motor de render es sustituible sin migrar documentos ya guardados.
- `DocumentoMC` completamente desacoplado del negocio, registro extensible de tipos de elemento, render desacoplado del modelo, IA modificando el documento mediante comandos (no el DOM), roadmap incremental.

---

## Transición desde el editor legado (Excalidraw) — estrategia temporal, no coexistencia permanente

Antes del Motor Documental existía ya un editor de presupuestos en lienzo libre sobre Excalidraw (Fase 6). Ese editor **no se sustituye de golpe** — coexiste con el Motor Documental durante una transición acotada, con reglas explícitas para que esa convivencia nunca se convierta en una segunda arquitectura permanente:

**Dos mundos, con campos independientes — nunca uno reutilizado con dos significados:**

| | Legado | Motor Documental |
|---|---|---|
| `formato` | `'lienzo'` | `'documento'` |
| Campo de contenido | `contenidoLienzo` (forma interna de Excalidraw — sin cambios) | `contenidoDocumento` (`DocumentoMC` real, validado) |
| Editor | Excalidraw (`editor-presupuesto-lienzo.tsx`) | El nuevo, sobre DOM + React |

Reutilizar un único campo con dos significados según la época en que se guardó habría sido más difícil de retirar limpiamente que mantener dos campos independientes y borrar uno entero cuando ya no haga falta.

**Reglas de la transición:**

1. Ningún documento nuevo se crea en `formato:'lienzo'` desde el momento en que el nuevo editor documental esté operativo.
2. El editor de Excalidraw pasa a ser oficialmente **editor legado**.
3. Su único propósito, a partir de ahora, es abrir y editar documentos históricos que todavía existan en ese formato.
4. Toda funcionalidad nueva del proyecto se desarrolla exclusivamente sobre `DocumentoMC`.
5. No se añade ninguna característica nueva al formato legado — solo correcciones de errores críticos, si aparecieran.
6. Cuando no exista ningún documento real en `formato:'lienzo'`, se elimina por completo: `contenidoLienzo`, el valor `'lienzo'` del enum, el editor legado, sus funciones de procesado de recursos específicas, y cualquier código asociado a Excalidraw en este módulo que ya no tenga utilidad. Ver Incremento 13 del roadmap — es un incremento por condición cumplida, no por fecha.

**Punto único de entrada — `AbrirDocumento`**: el resto de la aplicación nunca decide qué editor abrir. Un único componente despachador recibe el presupuesto y decide, mirando su `formato`, si monta el editor legado o el nuevo:

```
AbrirDocumento(presupuesto)
      ↓
detecta presupuesto.formato
      ↓
'lienzo'     → editor legado (Excalidraw)
'documento'  → editor del Motor Documental
```

Ningún otro componente de la aplicación importa el editor legado ni el nuevo directamente — todos pasan por `AbrirDocumento`. Es lo que permite que, el día que se retire el editor legado (regla 6), solo haya que tocar un archivo.

**Aplicación práctica de la regla 1, mientras el nuevo editor no existe**: los puntos de entrada de creación de documentos nuevos ("Crear presupuesto (plantilla)", la voz del menú lateral) se retiran de la interfaz durante el Incremento 1, y el Incremento 2 los reintroduce apuntando ya al editor nuevo — nunca al legado. Abrir/editar un documento legado ya existente sigue funcionando en todo momento a través de `AbrirDocumento`, sin ninguna ventana en la que deje de estar disponible.

---

## 0. Principio rector: dónde termina el documento y dónde empieza el negocio

`DocumentoMC` solo describe el contenido visual del documento. Todo lo que es *dato de negocio* (a qué cliente pertenece, si está aceptado o rechazado, el número de presupuesto en la secuencia contable) vive en el modelo Mongoose que envuelve el documento (`Presupuesto` hoy; `Contrato`, `Albaran`, etc. mañana) — igual que ya separa `contenidoLienzo` del resto de campos de `Presupuesto` ahora mismo. `DocumentoMC` no sabe que es un presupuesto, ni a qué cliente pertenece. Sabe cómo se ve, qué contiene y cómo se edita — nada más.

---

## 1. `DocumentoMC`

| Campo | Descripción |
|---|---|
| `id` | Identificador del documento (distinto del id del `Presupuesto`/`Contrato` que lo envuelve, aunque en la práctica vivan 1:1). |
| `schemaVersion` | Entero — versión del *esquema* `DocumentoMC` en sí, para migradores futuros del formato. |
| `documentoBaseId` | `string \| null`. Identidad de la "familia" lógica del documento — `null` si este documento **es** la raíz; si no, apunta al `id` del documento del que deriva. Permite en el futuro que coexistan varias versiones deliberadas del mismo documento lógico (ej. "Presupuesto — opción económica" y "Presupuesto — opción premium" enviados al mismo cliente) sin que una sobrescriba a la otra. **No se implementa todavía ninguna función sobre este campo** — solo se reserva para no tener que romper el esquema el día que haga falta (ver sección 1.3 para la distinción con el historial de guardados, que es un concepto distinto). |
| `etiquetaVersion` | `string \| null`. Nombre legible opcional para esa versión dentro de la familia (ej. "v2 — con acabado premium"). |
| `documentVersion` | Entero, incrementa en cada guardado con cambios reales — alimenta el historial de guardados (sección 1.3). |
| `plantillaOrigen` | `{ plantillaId, version } \| null`. De qué plantilla se instanció y qué versión — congelado en el momento de crear el documento. |
| `paginas` | `PáginaMC[]` — sección 2. |
| `configuracionPorDefecto` | Tamaño de página, orientación y márgenes que heredan todas las páginas salvo override explícito. |
| `fondoPorDefecto` | Igual, para el fondo. |
| `encabezadoPorDefecto` / `piePorDefecto` | `ZonaMC \| null` — franja repetida en todas las páginas salvo override (sección 2). |
| `variables` | Ver sección 1.2 — sustituye lo que en la primera revisión era solo `variablesResueltas`. |
| `configuracionImpresion` | Márgenes de sangrado, escala de exportación. Sin perfiles CMYK todavía — nadie lo ha pedido. |

### 1.1 Metadatos y configuración

Cubiertos arriba (`schemaVersion`, `configuracionPorDefecto`, `configuracionImpresion`).

### 1.2 Variables inteligentes

Sistema completo, no solo un diccionario de sustitución como en la primera revisión.

**Registro de variables disponibles** — mismo patrón de registro que el resto del núcleo (sección 3.3): cada "fuente" de datos (`cliente`, `empresa`, `presupuesto`, `sistema` — y cualquier fuente nueva en el futuro, ej. `contrato` cuando exista ese tipo de documento) registra qué variables puede ofrecer, sin que el motor de variables conozca de antemano la lista cerrada:

| Campo del registro | Descripción |
|---|---|
| `clave` | Identificador punteado, ej. `cliente.nombre`, `presupuesto.total`, `fecha`. |
| `fuente` | `'cliente' \| 'empresa' \| 'presupuesto' \| 'sistema' \| ...` (extensible). |
| `etiqueta` | Nombre legible para el selector del editor (ej. "Nombre del cliente"). |
| `tipoDato` | `'texto' \| 'numero' \| 'fecha' \| 'moneda'` — determina el formato de salida al resolver (ej. `presupuesto.total` se formatea como `1.234,56 €`, no como número plano). |
| `resolver` | Función que, dado el contexto real (el cliente/empresa/presupuesto concretos), devuelve el valor. Vive junto a cada fuente registrada, no en un lugar central. |

**Uso en una plantilla**: un elemento Texto dentro de `PlantillaMC.documentoBase` puede contener `{{cliente.nombre}}` literalmente en su `contenido.texto`. El editor de plantillas ofrece autocompletado a partir del registro, para que nunca haga falta recordar de memoria las claves disponibles.

**Resolución**: una función pura `resolverVariables(plantilla, contexto) → DocumentoMC` sustituye cada `{{clave}}` encontrada por su valor real, usando el `resolver` registrado de la fuente correspondiente. El resultado es un documento normal, sin ninguna marca de que ahí hubo una variable — el texto ya es texto de verdad.

**`DocumentoMC.variables`** (antes `variablesResueltas`): `{ claves: Record<string, string> }` — registro de auditoría de qué se sustituyó y con qué valor, útil para depurar o para una futura función "regenerar desde plantilla actualizada". Nunca se vuelve a leer en caliente durante la edición normal ni el render — el contenido real ya quedó escrito.

### 1.3 Versionado e historial — tres conceptos distintos, que no hay que confundir

1. **Deshacer/rehacer** (sección 7.8): solo en memoria, solo durante la sesión de edición activa. El "Ctrl+Z" de toda la vida.
2. **Historial de guardados**: cada guardado con cambios reales incrementa `documentVersion`. La foto completa se guarda en una colección aparte, `DocumentoMCHistorial` (`{ documentoId, documentVersion, snapshot, guardadoEn, guardadoPor }`), con una política de retención razonable — a decidir en el incremento correspondiente. Es "volver a como estaba ayer", del mismo documento.
3. **Versiones paralelas deliberadas** (`documentoBaseId`, nuevo en esta revisión): varios `DocumentoMC` distintos, con identidad propia cada uno, que comparten la misma familia lógica pero coexisten a propósito — no es un historial lineal, es una ramificación consciente. Reservado en el esquema, sin funcionalidad todavía.

---

## 2. `PáginaMC`

Sin cambios respecto a la primera revisión.

| Campo | Descripción |
|---|---|
| `id` | Identificador de la página. |
| `indice` | Orden dentro del documento. |
| `nombre` | Etiqueta visible en el panel de páginas. |
| `configuracion` | `{ ancho, alto, orientacion, margenes } \| null` — `null` hereda de `DocumentoMC.configuracionPorDefecto`. |
| `fondo` | `FondoMC \| null` — mismo patrón de herencia. |
| `encabezado` / `pie` | `ZonaMC \| null \| 'ninguno'` — `null` hereda, `'ninguno'` desactiva explícitamente, un valor concreto sobrescribe. |
| `numeracion` | `{ mostrar, formato, posicion }` — el texto ("Página 2 de 5") se resuelve en render/exportación, nunca se guarda fijo. |
| `elementos` | `ElementoMC[]`. |

`ZonaMC`: `{ altura, elementos: ElementoMC[] }`. `FondoMC`: `{ tipo: 'color' \| 'imagen' \| 'ninguno', color?, imagenUrl?, ajuste? }`.

---

## 3. `ElementoMC`

### 3.1 Envolvente común

| Campo | Descripción |
|---|---|
| `id` | Identificador del elemento. |
| `tipo` | Discriminador — ver registro de tipos en 3.3. |
| `posicion` | `{ x, y }`, relativa a la página o zona. |
| `tamano` | `{ ancho, alto }`. |
| `rotacion` | Grados, sentido horario. |
| `capa` | Entero — un solo campo, no dos, para "capa" y "orden". |
| `grupoId` | `string \| null` — agrupación libre (sección 7.3), distinta de `origenComponente`. |
| `bloqueado` | `boolean` — impide seleccionar/mover/transformar. |
| `restricciones` | **Nuevo en esta revisión** — ver más abajo. Sustituye al antiguo campo `visible: boolean` de la primera revisión, que queda absorbido dentro de `visibilidad`. |
| `opacidad` | `0-1`. |
| `estilo` | Sección 4. |
| `contenido` | Payload específico del tipo — sección 3.2. |
| `propiedadesEspecificas` | Configuración adicional específica del tipo. |
| `origenComponente` | `{ componenteId, version, modo: 'vinculado' \| 'independiente' } \| null` — **nuevo en esta revisión**, ver sección 3.4. |

**`restricciones`** (motor de restricciones, sección 11):

| Campo | Valores | Significado |
|---|---|---|
| `soloLectura` | `boolean` | Se puede seleccionar/mover/reestilar, pero no editar su contenido de texto. Distinto de `bloqueado` (que impide hasta seleccionarlo) — son ortogonales: un elemento puede estar bloqueado y además de solo lectura, o solo una de las dos cosas. |
| `visibilidad` | `'siempre' \| 'soloEdicion' \| 'soloImpresion' \| 'oculto'` | Sustituye al booleano `visible` de la primera revisión. `soloEdicion` sirve para notas/guías internas que no deben salir en el PDF; `soloImpresion` para elementos (ej. un pie legal) que solo interesa ver en el resultado final, no mientras se edita. |
| `obligatorio` | `boolean` | Marca el elemento como necesario para considerar el documento completo (ej. el NIF del cliente en un contrato). No bloquea nada todavía — reservado para una futura validación previa a exportar/enviar. |

### 3.2 Los trece tipos

Los doce ya definidos en la primera revisión (Texto, Imagen, Logotipo, Tabla, Línea, Rectángulo, Precio destacado, Firma, Código QR, Dibujo, Archivo adjunto, Bloque IA — sin cambios en su diseño) más uno nuevo:

| Tipo | `contenido` | Notas |
|---|---|---|
| **Instancia de componente** | `{ componenteId, version, overridesLocales?: Record<string, unknown> }` | El elemento no contiene directamente su apariencia — al renderizar, se resuelve leyendo `ComponenteMC.elementos` (sección 3.4) y pintándolos posicionados relativos a la `posicion`/`tamano` de esta instancia. `overridesLocales` queda reservado para diferencias puntuales sin desvincular (ej. cambiar solo el texto de un pie mientras se sigue heredando el resto) — **no se implementa en el primer incremento del componente**, se documenta la vía para no bloquearla después. |

### 3.3 Extensibilidad sin tocar el núcleo

Sin cambios: registro de tipos, mismo patrón que `ia-registro-capacidades.ts`/`ia-registro-proveedores.ts` — cada tipo aporta su validador, sus controles de panel de propiedades y su adaptador de render; el núcleo nunca contiene una lista cerrada.

### 3.4 Componentes reutilizables — nuevo

`ComponenteMC`: `{ id, nombre, tipo: 'cabecera' | 'pie' | 'firma' | 'condiciones' | 'bloqueCorporativo' | 'libre', elementos: ElementoMC[], ambito: 'corporativa' | 'usuario', creadoEn, actualizadoEn }`. Catalogado aparte, mismo nivel que `PlantillaMC` y `RecursoMC` (sección 6) — no vive dentro de ningún documento concreto.

**Cómo se usa**: se inserta en un documento como un elemento de tipo `Instancia de componente` (3.2), nunca copiando sus elementos hijos directamente dentro del documento.

**La decisión que pedías — "solo esta instancia o todas"** — se resuelve con el campo `modo` de `origenComponente`:
- **`vinculado`**: la instancia siempre pinta la versión *actual* de `ComponenteMC` en el momento de renderizar. Editar el componente actualiza automáticamente todas las instancias vinculadas, en todos los documentos donde se use. No se puede editar el contenido de una instancia vinculada directamente — para eso hay que desvincular primero.
- **`independiente`**: al "desvincular" una instancia, sus elementos se materializan de verdad dentro del documento (se copian los `ElementoMC` reales, dejan de depender del componente) — desde ese momento es un grupo de elementos normal y corriente, editable sin restricción, y los cambios futuros al `ComponenteMC` original ya no le afectan.

Es el mismo patrón, ya validado durante años en herramientas de diseño reales (componente maestro / instancia, con la opción de "desvincular"), aplicado aquí — no una idea experimental.

**Nota de alcance**: overrides parciales manteniendo el vínculo (cambiar solo un texto de una instancia sin desvincular el resto) quedan fuera del primer incremento de esta pieza — el campo `overridesLocales` ya reserva el hueco en el esquema, pero se implementa binario (vinculado/independiente) primero, y solo se añade la granularidad fina si de verdad hace falta en la práctica.

---

## 4. Sistema de estilos

Sin cambios respecto a la primera revisión: estilo embebido → `EstiloMC` con nombre reutilizable → `Tema` (paleta con nombres semánticos + tipografías) → identidad corporativa (el tema por defecto de una `Empresa`).

---

## 5. Sistema de plantillas

Sin cambios en la estructura (`PlantillaMC` con `ambito` corporativa/usuario/compartida/ia). Se conecta ahora explícitamente con el registro de variables (sección 1.2): `PlantillaMC.documentoBase` es donde viven las variables sin resolver, y el editor de plantillas ofrece el selector de variables disponibles a partir de ese mismo registro.

---

## 6. Biblioteca de recursos — nuevo

`RecursoMC`: `{ id, nombre, tipo: 'logo' | 'icono' | 'imagen' | 'fondo' | 'sello' | 'otro', url, mimeType, tamano, hashContenido, ambito: 'corporativa' | 'usuario', etiquetas: string[], creadoEn }`.

- Almacenamiento real vía `almacenamiento.service.ts` (ya existe, sin cambios) — `RecursoMC` es solo el catálogo, no un nuevo mecanismo de subida.
- `hashContenido`: al subir un archivo, se calcula su hash antes de crear una entrada nueva — si ya existe un `RecursoMC` con el mismo hash, se reutiliza en vez de duplicar el almacenamiento. Detalle de diseño, no imprescindible en el primer incremento, pero vale la pena dejarlo escrito ahora para no tener que rehacer el catálogo después.
- Un `ElementoMC` de tipo Imagen/Logotipo que usa un recurso de la biblioteca guarda `recursoId` (referencia) además de `url` (copia resuelta, para que renderizar/exportar no dependa de una consulta extra) — permite en el futuro funciones como "sustituir todos los usos de este sello" sin tener que rastrear documento por documento.
- `etiquetas` habilita búsqueda/organización dentro de la biblioteca (ej. "sello", "2026", "obra Villa Ventura").

---

## 7. Motor de edición

Sin cambios de fondo respecto a la primera revisión — se añade un comando nuevo derivado de la sección 3.4:

| Pieza | Diseño |
|---|---|
| 7.1 Selección | Conjunto de ids. |
| 7.2 Multiselección | UI, rellena 7.1. |
| 7.3 Agrupación | `agrupar(ids[])` asigna `grupoId` común; rotar/escalar un grupo se calcula alrededor de su centro. |
| 7.4 Bloqueo | `bloquear`/`desbloquear` sobre `ElementoMC.bloqueado`. |
| 7.5 Alineación | Recalcula `posicion` del conjunto seleccionado. |
| 7.6 Distribución | Espaciado uniforme entre los seleccionados. |
| 7.7 Copiar/pegar/duplicar | Clona con ids nuevos y offset de posición. |
| 7.8 Deshacer/rehacer | Pila de comandos, solo en sesión — distinto del historial de guardados (1.3). |
| 7.9 Capas | Panel ordenado por `capa`. |
| 7.10 Zoom/reglas/guías/snapping | Zoom es un factor de vista, nunca toca coordenadas reales; snapping reutiliza conceptualmente el mecanismo ya construido para las cotas en `editor-dibujo.tsx`. |
| 7.11 Panel de propiedades | Derivado del registro de tipos (3.3). |
| **7.12 Desvincular instancia** (nuevo) | Comando que materializa los elementos de una `Instancia de componente` vinculada, convirtiéndola en `independiente` (3.4). |

---

## 8. Motor de render — separación de capas

Sin cambios:

```
DocumentoMC → Motor de edición → Adaptador de render → Render React/DOM → Exportación
```

Cada capa solo conoce la inmediatamente inferior. El adaptador de render es el único punto que cambiaría si algún día se sustituye la tecnología de render. Nota nueva: el adaptador es también responsable de resolver `origenComponente` (3.4) al pintar, y de respetar `restricciones.visibilidad` (3.1) según el contexto (edición vs impresión).

---

## 9. Exportación

Sin cambios: exportar y editar comparten el mismo render (el PDF sale del mismo HTML que ve el usuario en el editor, vía Puppeteer/Playwright `page.pdf()`). La única adición: al exportar a PDF/impresión, el adaptador filtra por `restricciones.visibilidad !== 'soloEdicion'`; al mostrar el editor, filtra lo contrario.

---

## 10. Integración con IA

Sin cambios en el principio (la IA nunca toca el DOM, solo emite los mismos comandos que un humano — sección 7). Con la adición de la sección 11, la IA deja de ser el único actor no-humano que puede emitir comandos: las automatizaciones (11.2) son un tercer actor sobre el mismo canal.

---

## 11. Motor de restricciones y automatización — nuevo

### 11.1 Restricciones a nivel de elemento

Ya integradas en el núcleo (`ElementoMC.restricciones`, sección 3.1): `soloLectura`, `visibilidad` (`siempre`/`soloEdicion`/`soloImpresion`/`oculto`), `obligatorio`. No es una capa aparte — es parte del modelo desde la base, precisamente para que el motor de edición y el de render las respeten de forma consistente sin tener que consultar un sistema externo.

### 11.2 Automatización por eventos de plataforma, sin acoplar el motor documental

El proyecto **ya tiene un bus de eventos interno** (`eventos.service.ts`, `busEventos.publicar(...)` — usado hoy, por ejemplo, al crear un presupuesto). La automatización se apoya en esa infraestructura existente, no en una nueva:

- `AutomatizacionMC`: `{ id, evento: string (ej. 'presupuesto.aprobado', 'instalacion.finalizada', 'factura.emitida'), condicion?, accion: 'crearDocumento' | 'modificarElemento' | 'notificar' | ..., configuracionAccion }`.
- Un listener se suscribe a `busEventos`. Cuando se publica un evento que coincide con alguna `AutomatizacionMC` registrada, la automatización **emite el mismo tipo de comando** que ya usan el motor de edición humano y la IA (sección 7 / 10) contra el documento objetivo — nunca escribe directamente sobre `DocumentoMC` ni conoce el DOM.

**Por qué esto no acopla el motor documental al resto de la plataforma**: el motor documental no sabe que existe "presupuesto aprobado" como concepto — solo sabe recibir comandos por el canal ya definido. Quien traduce "ocurrió este evento de negocio" a "ejecuta este comando sobre este documento" es una capa aparte (el listener de automatización), fuera del núcleo. El motor documental seguiría funcionando exactamente igual si mañana desaparece todo el sistema de automatización.

Ejemplo concreto de uso futuro (no se implementa ahora): al publicarse `presupuesto.aprobado`, una automatización podría generar automáticamente un documento de tipo Contrato a partir de una plantilla, con las variables ya resueltas desde ese presupuesto — sin que nadie tenga que crearlo a mano.

---

## 12. Escalabilidad — evaluación honesta a 10 años

Sin cambios de fondo respecto a la primera revisión. Con las cinco piezas nuevas, se refuerza el mismo argumento: componentes reutilizables, biblioteca de recursos y automatización por eventos son exactamente el tipo de capacidad que distingue una herramienta interna de un producto de referencia — y las tres se apoyan en patrones ya usados en la industria (componente/instancia de las herramientas de diseño, bus de eventos ya existente en este mismo proyecto) en vez de inventar mecanismos nuevos sin precedente.

Sigue sin construirse edición colaborativa en tiempo real — sigue sin haber sido pedida, y el diseño (comandos como única vía de mutación) sigue siendo compatible con añadirla después sin rediseñar el núcleo.

---

## Reglas de oro del Motor Documental

Principios que no se rompen mientras evolucione el proyecto, sea cual sea el incremento en curso. Si una decisión futura entra en conflicto con alguna de estas reglas, la regla gana — se detiene la implementación y se replantea, no se hace la excepción en silencio.

1. **`DocumentoMC` es la única fuente de verdad.** Nunca se almacena el documento en el formato interno de ninguna librería externa.
2. **El motor de render nunca es dueño del documento.** React, DOM, `react-moveable` o cualquier tecnología futura solo representan visualmente `DocumentoMC` — nunca lo definen.
3. **Toda modificación del documento se realiza mediante comandos.** Nunca se modifica el DOM directamente. Nunca se modifica el render directamente. Humano, IA y automatizaciones usan exactamente el mismo mecanismo (secciones 7, 10, 11).
4. **Ningún módulo de negocio depende del motor documental.** Presupuestos, contratos, informes, certificados o cualquier otro módulo solo conocen `DocumentoMC` — nunca sus tipos internos de edición ni su motor de render.
5. **El motor documental nunca conoce reglas de negocio.** No sabe qué es un presupuesto, una factura o un contrato. Solo conoce documentos (sección 0).
6. **Todo elemento es extensible.** Añadir un nuevo tipo de elemento nunca requiere modificar el núcleo (sección 3.3).
7. **Todo recurso reutilizable vive en la biblioteca de recursos.** No se duplican imágenes, logotipos ni fondos innecesariamente (sección 6).
8. **La IA nunca actúa sobre el DOM.** Siempre trabaja sobre `DocumentoMC` mediante comandos (sección 10).
9. **La exportación representa exactamente el mismo documento que ve el usuario.** Nunca dos motores de render distintos para editar y exportar (sección 9).
10. **Toda decisión futura preserva la compatibilidad con los documentos existentes.** Ninguna funcionalidad nueva rompe documentos ya guardados — para eso existe `schemaVersion` (sección 1) y se escriben migradores, nunca cambios destructivos silenciosos.

---

## Roadmap de incrementos (actualizado)

1. **Núcleo mínimo**: `DocumentoMC`/`PáginaMC`/`ElementoMC` con los tipos Texto, Imagen, Logotipo, Línea, Rectángulo, Archivo adjunto, Precio destacado + persistencia en MongoDB (`contenidoDocumento`, campo nuevo e independiente de `contenidoLienzo`, ver sección de transición). Incluye retirar de la interfaz los puntos de entrada de creación de documentos nuevos, hasta que el Incremento 2 los reconecte al editor nuevo.
2. **Motor de edición básico**: selección, mover/redimensionar/rotar con `react-moveable`, deshacer/rehacer de sesión, guardado. Su criterio de cierre incluye reconectar "Crear presupuesto" al editor nuevo — desde ese momento, `documento` es el único formato creable (regla de transición 1).
3. **Sistema de estilos**: estilos con nombre + temas + identidad corporativa.
4. **Sistema de plantillas + variables inteligentes**: registro de variables, resolución al instanciar, selector de variables en el editor de plantillas.
5. **Biblioteca de recursos**: catálogo `RecursoMC`, deduplicación por hash, selector dentro del editor.
6. **Componentes reutilizables**: `ComponenteMC`, tipo "Instancia de componente", vinculado/independiente, comando de desvincular.
7. **Tipos avanzados**: Tabla, Firma, Código QR, Dibujo (incrustando el Excalidraw existente), Bloque IA.
8. **Exportación real**: PDF/impresión vía servidor, PNG/JPG, HTML, compartición.
9. **IA sobre comandos del documento**: sustituye/extiende `redactar-presupuesto` para operar sobre el canal de comandos.
10. **Motor de restricciones aplicado**: `visibilidad`/`soloLectura`/`obligatorio` respetados de verdad en editor y exportación (el campo ya existe desde el incremento 1, pero su efecto real llega aquí).
11. **Automatización por eventos**: `AutomatizacionMC` sobre el bus ya existente.
12. **Segundo tipo de documento** (ej. Contratos): prueba real de que la reutilización del núcleo se cumple.
13. **Retirada del editor legado** (condicional, sin fecha fija — se dispara cuando ya no exista ningún documento real en `formato:'lienzo'`, no en un punto concreto del calendario): eliminar `contenidoLienzo`, el valor `'lienzo'` del enum, `editor-presupuesto-lienzo.tsx`, y todo el procesado de recursos y código asociado a Excalidraw que quede sin uso en este módulo.

Cada incremento sigue el ciclo ya acordado: auditoría → propuesta → implementación → pruebas reales → informe → checkpoint, con tu autorización explícita antes de cada commit y cada push.
