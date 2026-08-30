# Auditoría Legal, Privacidad y Consentimientos — Madera Creativa Estudio

**Fase 1 de 4 (auditoría y documentación) — 30/08/2026.**
Encargo original: `Prompt_Implementacion_Legal_Madera_Creativa_Estudio.pdf`.

> Este documento es el resultado de **inspeccionar el repositorio real**, no
> una plantilla genérica. Cada fila de la matriz apunta a un archivo/modelo
> concreto. Ningún dato legal (identidad jurídica, NIF, domicilio, países,
> plazos, bases jurídicas) se ha inventado — donde falta, se marca
> **PENDIENTE DE VALIDACIÓN LEGAL**. No se ha modificado ni una línea de
> código de producto en esta fase: es solo auditoría.

---

## 0. Cómo leer este documento

- **Implementado técnicamente** = existe en el código, verificado leyendo el archivo citado.
- **PENDIENTE DE VALIDACIÓN LEGAL** = requiere una decisión/dato de un abogado o del propio negocio (identidad jurídica, base jurídica RGPD, plazo de conservación, si hay transferencia internacional, etc.) — nunca se ha rellenado con un valor inventado.
- **Riesgo**: alto / medio / bajo, criterio de negocio (impacto si algo sale mal), no una clasificación jurídica.

---

## 1. Documento legal YA existente (y sus huecos)

Ya existe `presupuestos-prototype/politica-privacidad.tsx` (página pública
`/politica-privacidad`, sin login), fechada 18/08/2026. Contenido real hoy:

- Declara responsable "Madera Creativa Estudio (Canarias, España)" — **sin NIF ni domicilio** (huecos reales, no defecto de redacción).
- Lista datos tratados: cuenta, clientes, económicos, fotos/documentos, biometría (WebAuthn), push.
- Afirma **"no las vendemos ni compartimos con terceros"** — inexacto tal cual: sí hay encargados de tratamiento reales (OpenAI, Resend, Cloudflare R2, MongoDB Atlas — ver §5-6). Hay que revisar esta frase: probablemente lo que se quiere decir es "no cedemos a terceros para SUS fines propios", que es distinto de "no usamos encargados para prestar el servicio".
- Afirma **"no usamos cookies de rastreo ni analítica de terceros"** — esto SÍ es correcto, confirmado por auditoría (§9): no hay ningún script de analítica/tracking en el frontend.
- **No tiene versión** (solo una fecha de texto libre, sin campo estructurado) ni historial — si se cambia, se pierde la anterior.
- **No hay Aviso Legal, Términos y Condiciones, Política de Cookies ni DPA** — no existen como páginas ni como documentos en ningún sitio del repositorio (comprobado: no hay ningún archivo `*terminos*`, `*aviso-legal*`, `*dpa*` en `presupuestos-prototype/`).
- **El registro no enlaza ni exige aceptar nada** — `use-registro.ts`/`esquemaRegistro` (`esquemas-validacion.ts`) solo piden `nombre`+`password`(+código opcional). No hay checkbox de Términos, ni constancia de que se mostró la Política de Privacidad, ni nada versionado.

---

## 2. Funcionalidades relevantes para privacidad (inventario)

| Área | Qué hace | Archivo(s) clave |
|---|---|---|
| Alta/login/sesión | Registro, login, refresh token rotativo, recuperación de contraseña por email, cierre de sesión por inactividad configurable | `presupuestos-service.app-root.ts`, `refresh-token.model.ts`, `password.service.ts`, `token.service.ts` |
| Biometría / Passkey | WebAuthn (huella/Face ID) como segundo factor de acceso | `webauthn-rutas.ts`, `credencial-webauthn.model.ts`, `webauthn-config.ts` |
| Clientes | Ficha de identidad de terceros (clientes del usuario): nombre, teléfono, email, DNI/NIE, dirección | `cliente.model.ts` (`ClienteSchema`) |
| Proyectos | Expediente de obra: dirección, acceso (WhatsApp, código de puerta, planta...), mediciones, tareas, fotos, adjuntos, dibujos, modelo 3D | `cliente.model.ts` (`ProyectoSchema`, `Modelo3DSchema`) |
| Presupuestos/Contratos | Documentos comerciales, firma del cliente al aceptar (imagen), IP y user-agent de aceptación | `cliente.model.ts` (`PresupuestoSchema`, `ContratoSchema`), `enlace-presupuesto.model.ts` |
| Portal del cliente (enlace público) | El cliente final (tercero, no usuario registrado) ve y firma un presupuesto sin cuenta, vía token en URL | `portal-rutas.ts` |
| Facturación | Facturas de ingreso/gasto, imágenes escaneadas, PDFs, datos fiscales (CIF/NIF de terceros), bucket privado con URLs firmadas | `cliente.model.ts` (`FacturaSchema`), `almacenamiento-r2.ts` |
| Solicitud de reseñas | Enlace/QR individual por cliente hacia la ficha de Google del negocio | `enlace-resena.model.ts`, `resena-rutas.ts` |
| Notas | Notas/listas de tareas, pueden asociarse a un cliente/proyecto | `cliente.model.ts` (`NotaSchema`) |
| Notificaciones push | Suscripción push del navegador (endpoint + claves), preferencias por tipo | `usuario.model.ts` (`PushSubscriptionSchema`), `push.service.ts` |
| Email transaccional | Recuperación de contraseña (por ahora el único email real enviado) | `resend.service.ts` |
| Asistente / IA | Varias capacidades de IA: copiloto de presupuesto, redacción, extracción de datos de factura (visión), descripción de trabajo desde foto (visión), investigación de mercado con búsqueda web | `ia-*.ts` (ver §5) |
| Soporte | Hilos de conversación usuario↔admin (mejoras/incidencias) | `soporte-hilo.model.ts` |
| Diseño 3D | Subida manual de archivo 3D (`.glb`); integración OAuth con Trimble/SketchUp **aparcada, sin credenciales, sin activar** | `cliente.model.ts` (`Modelo3DSchema`), `trimble-*.ts` (ver §7) |
| Panel de administración | Gestión de usuarios (activar/suspender), códigos promocionales, costes de infraestructura | `usuario.model.ts`, `codigo-promocional.model.ts`, `coste-infraestructura.model.ts` |

---

## 3. Datos personales recogidos, por origen

### 3.1 Del propio usuario registrado (cuenta)
- `nombre` (usado como identificador de login — en la práctica un email, aunque el esquema no exige formato email), `password` (nunca en claro: bcrypt; **hash legado no criptográfico aún activo para 2 de 5 cuentas reales** — ver `password.service.ts` y memoria del proyecto sobre migración pendiente).
- `nombreMostrar`, `foto` de perfil (base64).
- Historial de accesos (fecha de cada login, últimos 50).
- Preferencias de notificación, recordatorios personalizados (texto libre).
- Credenciales WebAuthn: **nunca** biometría real — solo clave pública COSE + contador anti-replay + etiqueta del dispositivo (`credencial-webauthn.model.ts`, comentario explícito en el propio esquema).
- Suscripción push (endpoint + claves p256dh/auth del navegador).
- IP y User-Agent: NO se guardan de forma persistente para el propio usuario en operaciones normales (ver §4) — sí se registran puntualmente en dos flujos concretos de terceros (aceptación de presupuesto público, ver 3.3).

### 3.2 De "Empresa" (el propio negocio del usuario, un dato de la cuenta, no de un tercero)
Nombre comercial, titular real (autónomo), CIF/NIF, teléfono, email, IBAN, logo, firma manuscrita (base64), ubicación (comunidad/provincia/isla), región fiscal.

### 3.3 De clientes del usuario (terceros — el usuario es responsable de estos datos, Madera Creativa Estudio es, como mínimo en parte, encargado de tratamiento — ver §8)
- Identidad: nombre, teléfono, email, **DNI/NIE**, dirección (`ClienteSchema`).
- Datos de acceso a la obra: WhatsApp, ubicación, código de puerta, planta, observaciones (`ProyectoSchema`).
- Fotos del proyecto, adjuntos (PDF/imágenes), dibujos, modelo 3D.
- Facturas: pueden contener CIF/NIF, nombre e importes de terceros (proveedores o el propio cliente si es una factura de ingreso).
- **Firma manuscrita del cliente** al aceptar un presupuesto desde el Portal público, junto con **IP y User-Agent en el momento de aceptar** (`EnlacePresupuestoModel.aceptadoIp/aceptadoUserAgent` — única persistencia real de IP/UA de todo el sistema, y es de un tercero sin cuenta, no del usuario registrado).

### 3.4 Datos técnicos / seguridad (ver detalle en §4)
Tokens de sesión (hasheados), tokens de recuperación de contraseña (hasheados), logs de aplicación (nivel/mensaje, no auditados exhaustivamente en esta fase para PII incidental en el mensaje de error).

---

## 4. Datos técnicos: sesiones, IP, logs, seguridad, analítica

| Dato | ¿Se persiste? | Dónde | Nota |
|---|---|---|---|
| IP del usuario en login/uso normal | **No** | — | No se encontró ningún `req.ip` guardado en sesión/usuario. |
| IP + User-Agent al **aceptar un presupuesto público** | **Sí** | `EnlacePresupuestoModel.aceptadoIp/aceptadoUserAgent` | Es evidencia de aceptación contractual, de un tercero (cliente sin cuenta) — ver §8. |
| Access token | No persistido (JWT corto, firmado, en memoria/cabecera) | `token.service.ts` | — |
| Refresh token | Solo su **hash SHA-256** | `refresh-token.model.ts` | El valor en claro solo vive en cookie `httpOnly`. |
| Token de recuperación de contraseña | Solo su hash | `usuario.model.ts` (`resetTokenHash`) | — |
| Historial de logins | Sí, fecha ISO, últimos 50 | `usuario.model.ts` (`historialAccesos`) | Sin IP asociada. |
| Logs de aplicación | Sí (stdout de Render, vía `logger.service.ts`, Pino) | — | No auditado campo a campo si algún log incidental incluye datos personales en un mensaje de error — **pendiente de revisión** si se quiere una política de logs formal. |
| Analítica / tracking de terceros | **No existe ninguna** | Confirmado por grep en todo el frontend (`gtag`, `google-analytics`, `facebook.net`, `hotjar`, `clarity.ms`, `mixpanel`, `segment.com`) | Sin resultados — no hay Google Analytics, Meta Pixel, Hotjar, ni similar. |
| Rate limiting | Sí, por IP (no persistente, en memoria del proceso) | `rate-limit.middleware.ts` | Uso momentáneo de la IP para contar peticiones, no se guarda. |

---

## 5. Funcionalidades de IA — entradas, salidas, proveedor, almacenamiento, finalidad

**Proveedor único de IA: OpenAI** (`ia-proveedor-openai.ts` es el único archivo de todo el monorepo autorizado a hablar con la API de OpenAI — confirmado, "Único archivo... autorizado a construir un cliente `openai`"). Vía SDK oficial + Responses API (para búsqueda web).

| Capacidad | Entrada enviada a OpenAI | Salida | Se guarda? | Dónde |
|---|---|---|---|---|
| `extraer-datos-factura` | **Imagen de la factura** (puede contener CIF/NIF/nombre de un tercero) + nombre/CIF de la empresa del usuario | Texto/JSON propuesto (proveedor, importe, fecha...) — el usuario confirma antes de guardar, nunca se escribe solo | Auditoría de uso (tokens, coste, éxito) en `IaUsoModel` — **no** la imagen ni el contenido en sí | `ia-capacidad-extraer-factura.ts`, `ia-uso.model.ts` |
| `describir-trabajo-mercado` | **Foto(s) del espacio del cliente** + medidas reales (texto) | Descripción de texto (materiales, nº de módulos estimado) | Igual que arriba: solo telemetría de uso, no la foto | `ia-capacidad-describir-trabajo-mercado.ts` |
| Investigación de Mercado con IA | Tipo de trabajo, zona, alcance, nivel de calidad, descripción libre (puede incluir detalles del proyecto de un cliente) | Candidatos de precio de mercado con fuente/URL — el usuario confirma antes de guardar como referencia | **Sí**, resultado completo + caché 24h + auditoría permanente (append-only, nunca se borra) | `investigacion-mercado.model.ts` |
| Copiloto de presupuesto / redacción / asistente global | Contexto del presupuesto/cliente en curso (texto) | Texto/acciones sobre el propio presupuesto | Solo telemetría de uso | `ia-capacidad-copiloto-presupuesto.ts`, `ia-capacidad-redactar-presupuesto.ts`, `ia-capacidad-asistente-global.ts` |
| Todas | — | — | **Cada llamada** (éxito o error) registra: capacidad, proveedor, modelo, tokens entrada/salida, coste estimado, duración, si hubo fallback — **append-only, nunca se borra ni se actualiza** | `ia-uso.model.ts` |

**Puntos que necesitan revisión jurídica/contractual explícita (no se puede afirmar nada de esto sin confirmarlo con OpenAI):**
- Si OpenAI usa las imágenes/texto enviados para entrenar sus modelos.
- Cuánto tiempo conserva OpenAI esos datos en sus propios sistemas.
- En qué región/país procesa/almacena OpenAI esos datos (transferencia internacional fuera del EEE, previsiblemente EE.UU., **a confirmar con el DPA/términos comerciales de OpenAI vigentes en la cuenta usada**).
- Si existe un Data Processing Addendum (DPA) firmado con OpenAI para esta cuenta.

## 6. Proveedores externos / servicios de terceros (inventario completo)

| Proveedor | Para qué | Datos que le llegan | Archivo |
|---|---|---|---|
| **OpenAI** | IA (ver §5) | Ver tabla de arriba | `ia-proveedor-openai.ts` |
| **Resend** | Envío de email transaccional (hoy: recuperación de contraseña) | Email destinatario, asunto, HTML del mensaje | `resend.service.ts` |
| **Cloudflare R2** | Almacenamiento de archivos: fotos, adjuntos, logos, firmas, dibujos, modelos 3D (bucket público) y facturas (bucket privado dedicado, URLs firmadas temporales) | Contenido binario de todo lo anterior | `almacenamiento-r2.ts` |
| **MongoDB Atlas** | Base de datos principal (todos los modelos de este documento) | Todo dato persistente de la aplicación | `mongo-conexion.ts` |
| **Web Push (protocolo estándar, VAPID)** | Notificaciones push del navegador | Endpoint + claves de suscripción del navegador del usuario — el navegador/SO del usuario es el intermediario técnico (Google/Mozilla/Apple push services, según navegador), no un proveedor propio contratado | `push.service.ts` |
| **Render.com** | Hosting del backend | Todo el tráfico de la API pasa por su infraestructura | (infraestructura, no un archivo de código) |
| **Trimble/SketchUp** | Diseño 3D — **integración OAuth completa en código, pero APARCADA y sin credenciales activas** (ver §7) | Ninguno todavía — no hay ninguna cuenta conectada en producción | `trimble-*.ts` |

Para cada uno de estos, **falta confirmar (PENDIENTE DE VALIDACIÓN LEGAL/CONTRACTUAL)**: si hay DPA firmado, región de procesamiento/almacenamiento, y si hay transferencia internacional fuera del EEE.

---

## 7. Integraciones actuales o futuras — SketchUp/Trimble

Estado real confirmado en código y por decisión explícita del usuario (30/08/2026): **la integración OAuth con Trimble Connect existe completa en el repositorio (`trimble-oauth.ts`, `trimble-cifrado.ts`, `trimble-conexion.model.ts`, `trimble-conexion.service.ts`, `trimble-rutas.ts`) pero está APARCADA — sin Client ID/Secret configurados, sin ninguna cuenta conectada, sin usarse desde ninguna pantalla activa.** El único flujo de "Diseño 3D" activo hoy es la subida manual de un archivo `.glb`/`.stl` al bucket propio (R2).

Si se retoma en el futuro: guardaría el refresh token de Trimble **cifrado** (AES-256-GCM, nunca en claro) y el email de la cuenta de Trimble conectada — ver `trimble-conexion.model.ts`. **No modificar esta integración** (instrucción explícita del encargo, punto 10).

---

## 8. Privacidad de empresas clientes / relación responsable-encargado (DPA)

Distinción real en el modelo de datos, ya reflejada en el propio código sin que nadie la haya etiquetado jurídicamente todavía:

- **Madera Creativa Estudio es responsable** de los datos de la CUENTA del usuario (login, empresa, preferencias, uso de IA, facturación de la propia plataforma si la hubiera).
- **El usuario (carpintero/autónomo/empresa que usa la app) es responsable** de los datos de SUS PROPIOS clientes (nombre, DNI, dirección, fotos de su obra, firma de aceptación) — **Madera Creativa Estudio actúa como encargado de tratamiento** para estos datos: los almacena y procesa por cuenta e instrucción del usuario, aislados por `usuarioId` en cada colección (aislamiento técnico ya confirmado en el propio esquema — todas las colecciones de negocio llevan `usuarioId` indexado).

**PENDIENTE DE VALIDACIÓN LEGAL**: formalizar esta relación con un DPA/Acuerdo de Encargo de Tratamiento real entre Madera Creativa Estudio (encargado) y cada usuario/empresa (responsable) — hoy no existe ningún documento de este tipo, ni una pantalla que lo presente o lo haga aceptar.

---

## 9. Cookies y tecnologías de seguimiento

**Ninguna cookie de rastreo ni tecnología de analítica de terceros**, confirmado por auditoría del código (§4). Lo único equivalente:

- Cookie `httpOnly` con el refresh token (estrictamente necesaria para mantener la sesión — no es de rastreo).
- `localStorage` del navegador: token de acceso en memoria (no localStorage, ver `use-registro.ts`), preferencias de interfaz (modo privacidad, etc.).

**Conclusión de esta fase**: probablemente **no hace falta una Política de Cookies separada** (punto 3 del encargo: "solo si técnicamente corresponde") — con un aviso breve sobre cookies estrictamente necesarias dentro de la propia Política de Privacidad bastaría. Confirmar con el abogado si el criterio de "estrictamente necesaria, sin banner de consentimiento" aplica igual a la cookie de sesión.

---

## 10. Flujos de alta, baja, exportación y eliminación de cuentas

| Flujo | ¿Existe? | Detalle |
|---|---|---|
| Alta (registro) | Sí | `POST /auth/registrar` — sin ninguna aceptación de términos/privacidad (§1, §11). |
| Baja de cuenta (borrado a petición del usuario) | **No existe ningún endpoint** | Comprobado por búsqueda en todo el backend (`eliminarCuenta`, `borrarCuenta`, `/auth/eliminar` — sin resultados). El admin puede *suspender* una cuenta (`estado: 'suspendido'`), que revoca todos sus refresh tokens, pero no hay borrado real de datos. |
| Exportación de datos (portabilidad) | **No existe** | Sin resultados de ningún endpoint de exportación. |
| Derechos RGPD (acceso, rectificación, supresión, oposición, limitación, portabilidad) | **No hay ningún flujo automatizado** | La Política de Privacidad actual remite todo a un email manual (`holamaderacreativa@gmail.com`) — viable como proceso inicial, pero sin trazabilidad ni plazo garantizado técnicamente. |
| Borrado de archivos huérfanos | Sí, parcial | `borrado-pendiente.model.ts`/`borrado-pendiente.service.ts` reintenta borrados de R2 que fallaron — es infraestructura de limpieza técnica, no un derecho de usuario. |

**Esto es el hueco más directamente accionable de todo el encargo** (sección 9 del PDF: "no prometas capacidades que el backend no pueda cumplir realmente" — hoy, literalmente, no puede cumplir un derecho de supresión/portabilidad de forma automática).

---

## 11. LA MATRIZ (Funcionalidad → ... → cambio técnico necesario)

| Funcionalidad | Datos | ¿Personales? | Finalidad | Base jurídica | Proveedor | Transf. internacional | Conservación | Riesgo | Documento afectado | Cambio técnico necesario |
|---|---|---|---|---|---|---|---|---|---|---|
| Registro de cuenta | nombre (email), password | Sí | Prestar el servicio (crear cuenta) | PENDIENTE VALIDACIÓN (probable: ejecución de contrato) | MongoDB Atlas | PENDIENTE (región del clúster no confirmada) | Mientras la cuenta esté activa — PENDIENTE plazo tras baja | Alto (credenciales) | Términos, Privacidad | Checkbox de aceptación T&C + registro de consentimiento (Fase 2) |
| Login / sesión | password hash, refresh token hash, historial de accesos | Sí | Autenticación | PENDIENTE (ejecución de contrato) | MongoDB Atlas | PENDIENTE | Mientras la cuenta esté activa | Alto | Privacidad | Ninguno urgente — ya usa hashing/rotación correctos |
| Migración de hash legado | 2/5 cuentas reales aún con hash no-bcrypt | Sí | Seguridad de acceso | — (medida de seguridad, no de tratamiento) | MongoDB Atlas | PENDIENTE | — | Alto (seguridad, no legal) | — | Ya identificado como pendiente técnico fuera de este encargo — no tocar hasta 0 usuarios legados (ver memoria del proyecto) |
| Biometría / Passkey | Clave pública COSE, contador, etiqueta de dispositivo — **nunca dato biométrico real** | Técnicamente sí (identificador ligado a persona), pero sin dato biométrico | Autenticación reforzada, opcional | PENDIENTE (consentimiento explícito recomendado, al ser un dato especial por analogía aunque no sea biometría real) | MongoDB Atlas | PENDIENTE | Hasta que el usuario borra el dispositivo | Medio | Privacidad | Aclarar en Privacidad que NO es biometría real (ya lo hace) — posible consentimiento explícito separado |
| Ficha de cliente (terceros) | nombre, teléfono, email, **DNI/NIE**, dirección | Sí (de un tercero) | Gestión de la relación comercial del USUARIO con su cliente | Responsabilidad del usuario (responsable); Madera Creativa Estudio como encargado — PENDIENTE formalizar | MongoDB Atlas, Cloudflare R2 (si hay fotos/adjuntos) | PENDIENTE | PENDIENTE (¿mientras el proyecto esté activo? ¿legalmente exigido más tiempo por facturación?) | Alto (DNI es dato sensible de identificación) | Privacidad, **DPA (nuevo)** | DPA con cada usuario; posible minimización (¿hace falta el DNI siempre?) — decisión de producto+legal |
| Portal público de presupuesto | Firma manuscrita del cliente, **IP**, User-Agent | Sí (de un tercero sin cuenta) | Evidencia de aceptación contractual | PENDIENTE (probable: interés legítimo / prueba de consentimiento contractual) | MongoDB Atlas | PENDIENTE | Indefinida a propósito (es la prueba de aceptación) — confirmar si esto es correcto o necesita plazo | Alto (es la única IP persistida del sistema, de un tercero) | Privacidad, Términos del Portal (nuevo, específico) | Aviso de privacidad propio en la página del Portal (hoy no tiene ninguno) |
| Escáner de facturas / IA visión | Imagen de factura (puede llevar CIF/nombre de tercero) enviada a OpenAI | Sí (de un tercero, el proveedor/cliente de la factura) | Automatizar la introducción de datos de facturación | PENDIENTE | **OpenAI** | Sí, probable (EE.UU.) — **PENDIENTE confirmar con el DPA de OpenAI** | La imagen no se persiste tras la respuesta de la API (solo telemetría) — confirmar retención en el lado de OpenAI | Alto (datos fiscales de terceros a un proveedor de IA) | Privacidad (ampliar sección IA), posible DPA con OpenAI | Revisar/firmar DPA con OpenAI; añadir aviso específico sobre uso de IA en el escáner |
| Foto + descripción de trabajo (Investigación de Mercado) | Foto del espacio de un cliente enviada a OpenAI | Sí (indirectamente, el espacio/proyecto de un cliente) | Estimar precio de mercado | PENDIENTE | OpenAI | Igual que arriba | Igual que arriba, más la propia investigación SÍ se guarda indefinidamente (append-only) | Alto | Privacidad, DPA OpenAI | Igual que arriba + revisar si el append-only de `InvestigacionMercadoModel` necesita plazo de conservación |
| Todo uso de IA (telemetría) | tokens, coste, éxito/error, capacidad usada — sin contenido | Parcialmente (ligado a `usuarioId`) | Auditoría interna de coste/uso | Interés legítimo (probable) | MongoDB Atlas | PENDIENTE | Indefinida (append-only) | Bajo-medio | Privacidad | Ninguno urgente — no contiene el contenido real enviado |
| Notificaciones push | endpoint + claves del navegador | Sí (identificador de dispositivo) | Enviar avisos configurados por el propio usuario | PENDIENTE (consentimiento del propio usuario, ya implícito al activar) | Servicio push del navegador (Google/Mozilla/Apple) | PENDIENTE | Mientras la suscripción siga activa | Bajo | Privacidad | Ninguno urgente |
| Recuperación de contraseña por email | email, token hash | Sí | Seguridad de la cuenta | Ejecución de contrato / interés legítimo | **Resend** | Sí, probable (EE.UU., a confirmar) | Token expira; el email en sí no es un dato nuevo (ya es `nombre`) | Medio | Privacidad | Confirmar región/DPA de Resend |
| Almacenamiento de archivos (fotos, adjuntos, facturas, firmas, modelos 3D) | Contenido binario de todo lo anterior | Sí (mezcla: datos del usuario y de sus clientes) | Prestar el servicio | Ejecución de contrato | **Cloudflare R2** | PENDIENTE (Cloudflare permite elegir región — confirmar configuración real del bucket) | Mientras el proyecto/factura exista | Alto (facturas = datos fiscales de terceros) | Privacidad, DPA | Confirmar región de los buckets R2 configurados |
| Hilos de soporte | texto libre del usuario hacia el admin | Sí (puede incluir cualquier cosa que el usuario escriba) | Atención al cliente/soporte | Ejecución de contrato | MongoDB Atlas | PENDIENTE | Indefinida (sin borrado) | Bajo-medio | Privacidad | Ninguno urgente |
| Solicitud de reseñas | Enlace/QR por cliente, sin dato personal nuevo del cliente (solo cuenta usos/fecha) | Marginal | Marketing del propio negocio del usuario | PENDIENTE (interés legítimo del usuario, no de Madera Creativa Estudio) | MongoDB Atlas | PENDIENTE | Indefinida | Bajo | Privacidad | Ninguno urgente |
| Panel admin (usuarios, códigos) | nombre, estado, acceso de TODOS los usuarios | Sí | Gestión de la plataforma | Ejecución de contrato / interés legítimo del propio Madera Creativa Estudio | MongoDB Atlas | PENDIENTE | Mientras la cuenta exista | Medio | Privacidad | Ninguno urgente |
| Diseño 3D (Trimble, aparcado) | Ninguno todavía (sin credenciales activas) | No aplica hoy | — | — | Trimble/SketchUp (si se retoma) | PENDIENTE | — | — (futuro) | Privacidad (ampliar si se retoma) | **No tocar** hasta que el usuario lo pida explícitamente (ya documentado en memoria del proyecto) |
| Baja/exportación/eliminación de cuenta | — | — | Ejercicio de derechos RGPD | Obligación legal (RGPD Art. 15-21) | — | — | — | **Alto — funcionalidad inexistente** | Términos, Privacidad, **nueva pantalla "Mis datos"** | **Construir**: endpoint de exportación + flujo de baja/eliminación con periodo de gracia, ver §10 |

---

## 12. Riesgos priorizados (criterio de negocio, no jurídico)

1. **Alto — No existe borrado/exportación de cuenta.** Bloqueante real para un lanzamiento público sujeto a RGPD si no se resuelve antes o en paralelo al resto.
2. **Alto — Registro sin aceptación de ningún documento.** Cualquier usuario nuevo entra sin haber visto ni aceptado nada — riesgo de que la Política de Privacidad actual no sea oponible/demostrable.
3. **Alto — DNI/NIE de clientes de terceros sin un DPA que regule esa relación.** El usuario (carpintero) es responsable de esos datos; hoy no hay ningún documento que reparta obligaciones entre él y Madera Creativa Estudio.
4. **Medio-alto — Flujos de IA con imágenes/datos de terceros hacia OpenAI sin DPA confirmado ni aviso específico** más allá de la mención genérica de "IA" (si la hay) en la Política de Privacidad actual (no la menciona en absoluto hoy).
5. **Medio — Identidad jurídica incompleta** (sin NIF/domicilio) en el único documento legal existente.
6. **Bajo — Cookies**: no hay riesgo real detectado, solo falta reflejarlo con precisión.

---

## 13. Qué NO se ha hecho en esta fase (y por qué)

Siguiendo el encargo ("esta fase debe ser incremental. Primero audita y documenta"):

- No se ha tocado ningún modelo de datos, ruta ni pantalla.
- No se ha redactado ningún texto legal nuevo ni modificado la Política de Privacidad existente.
- No se ha diseñado todavía el modelo de datos de aceptación/consentimiento versionado (punto 5 del encargo) — es el siguiente paso lógico (Fase 2), pero requiere antes que el usuario confirme algunas decisiones de esta auditoría (¿qué documentos hacen falta de verdad? ¿DNI es imprescindible en la ficha de cliente o se puede hacer opcional para minimizar?).
- No se ha tocado la integración Trimble/SketchUp (instrucción explícita del encargo).

## 14. Preguntas para el usuario / puntos que debe validar un abogado antes de la Fase 2

1. **Identidad jurídica real**: razón social, NIF, domicilio, forma jurídica (autónomo/SL) — para el Aviso Legal y como responsable del tratamiento en la Política de Privacidad.
2. **Confirmar con OpenAI, Resend, Cloudflare y MongoDB Atlas**: si hay DPA vigente, región de procesamiento/almacenamiento configurada realmente (no asumida), y si hay transferencia internacional a certificar (SCCs, adequacy decision, etc.).
3. **¿El DNI/NIE de un cliente es imprescindible siempre?** — hoy es un campo opcional en el esquema (`default: ''`) pero conviene decidir si el flujo de producto debería dejarlo claramente opcional/justificado en la interfaz también.
4. **Plazos de conservación** para cada categoría (cuenta inactiva, proyecto finalizado, factura — hay obligaciones fiscales de conservación mínima en España que probablemente marcan un mínimo, a confirmar).
5. **Alcance real del DPA usuario↔Madera Creativa Estudio**: ¿se ofrece igual a todos los usuarios (contrato de adhesión) o varía por plan/volumen?
6. **Prioridad de construcción**: ¿el borrado/exportación de cuenta se implementa en la Fase 2 junto con el consentimiento, o se trata como un proyecto aparte por su tamaño?

---

## 15. Entregable de esta fase — resumen

- **Archivos inspeccionados**: todos los modelos de datos (`*.model.ts`), rutas de auth/portal/webauthn, todas las capacidades de IA, servicios de terceros (Resend, R2, push), frontend (`politica-privacidad.tsx`, `use-registro.ts`, `use-auth.ts`, búsqueda de trackers).
- **Documento legal existente**: 1 (Política de Privacidad), con huecos identificados en §1.
- **Documentos legales que faltan por completo**: Aviso Legal, Términos y Condiciones, DPA. Política de Cookies probablemente no necesaria (§9).
- **Funcionalidad crítica inexistente**: borrado/exportación de cuenta (§10).
- **Proveedores confirmados**: OpenAI, Resend, Cloudflare R2, MongoDB Atlas, Render.com, servicios push nativos del navegador. Trimble/SketchUp aparcado, sin datos reales todavía.
- **Ningún cambio de código en esta fase.**

**Siguiente paso propuesto (Fase 2, solo tras confirmar los puntos del §14)**: diseñar el modelo de datos de aceptación/consentimiento versionado + los endpoints y pantallas mínimas para que el registro exija Términos y deje constancia de la Política de Privacidad, sin bloquear el resto del roadmap del producto.
