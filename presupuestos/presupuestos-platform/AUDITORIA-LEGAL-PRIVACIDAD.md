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

## 14. Preguntas pendientes de validación legal (versión ampliada, revisada con el usuario 30/08/2026)

**Ninguna respuesta a continuación está decidida.** Cada pregunta indica: qué decisión hace falta, por qué afecta a Madera Creativa Estudio, si requiere validación de abogado/asesor, y qué parte técnica depende de la respuesta. No se implementa nada de la Fase 2 hasta resolver este bloque.

### 14.1 Términos y Condiciones

**Q1.** ¿Partimos de algún borrador ya existente fuera del repositorio, o el primer documento nace 100% como placeholder "PENDIENTE DE VALIDACIÓN LEGAL"?
- *Por qué afecta*: sin T&C no hay base contractual de uso (límites de responsabilidad, motivos de suspensión, condiciones de acceso).
- *¿Abogado?* Sí — el contenido sustantivo debe redactarlo o revisarlo un abogado.
- *Depende técnicamente*: el modelo de "documento legal versionado" (Fase 2) necesita al menos un documento real (aunque sea placeholder) para poder mostrarlo/enlazarlo en el registro.

**Q2.** ¿Qué ley aplicable y jurisdicción se declaran?
- *Por qué afecta*: contenido legal sustantivo, no técnico.
- *¿Abogado?* Sí.
- *Depende técnicamente*: nada directo — solo el texto del placeholder.

### 14.2 Política de Privacidad

**Q3.** Identidad jurídica completa del responsable (razón social exacta, NIF/CIF, domicilio, forma jurídica) — hoy el documento solo dice "Madera Creativa Estudio (Canarias, España)", sin NIF ni domicilio.
- *Por qué afecta*: es obligatorio identificar al responsable de forma completa (Art. 13 RGPD).
- *¿Abogado?* No para aportar el dato (lo tiene el propio negocio), sí para confirmar que el texto final que lo incluye es correcto.
- *Depende técnicamente*: nada de código — dato de texto. (No confundir con `Empresa.nifCif`, que es el NIF de cada USUARIO de la plataforma, no el de Madera Creativa Estudio como responsable — hay que aclarar esta distinción en el propio documento).

**Q4.** Reformular la frase actual "no las vendemos ni compartimos con terceros" para reflejar con precisión los encargados de tratamiento reales (OpenAI, Resend, Cloudflare R2, MongoDB Atlas).
- *Por qué afecta*: tal como está podría ser jurídicamente inexacta si se lee de forma literal.
- *¿Abogado?* Sí — la redacción exacta.
- *Depende técnicamente*: ninguno.

**Q5.** ¿Debe distinguirse explícitamente entre datos que Madera Creativa Estudio trata como responsable (cuenta, empresa) y datos que trata como encargado (clientes del usuario)?
- *Por qué afecta*: son dos regímenes jurídicos distintos; hoy el documento los mezcla en una sola lista.
- *¿Abogado?* Sí.
- *Depende técnicamente*: estructura del documento parametrizable (Fase 3) y posible aviso de privacidad propio para el Portal público (ver Q14).

### 14.3 Aviso Legal

**Q6.** Misma identidad jurídica que Q3, más: ¿epígrafe/actividad de autónomo o datos de inscripción en registro mercantil si es sociedad?
- *Por qué afecta*: contenido obligatorio de un Aviso Legal en España (LSSI).
- *¿Abogado?* Sí, o al menos el titular del negocio debe aportarlo con la forma jurídica correcta.
- *Depende técnicamente*: nueva página `/aviso-legal` — hoy no existe ninguna.

### 14.4 Cookies

**Q7.** ¿Es correcto el criterio "solo cookie estrictamente necesaria (sesión `httpOnly`) → sin banner de consentimiento", tal como está implementado hoy?
- *Por qué afecta*: si un abogado considera que hace falta banner igualmente, cambia el punto 3 del encargo original ("Política de Cookies solo si corresponde").
- *¿Abogado?* Sí.
- *Depende técnicamente*: si la respuesta es "sí hace falta banner", construir un componente de consentimiento de cookies (hoy no existe ninguno); si es "no hace falta", no se toca nada.

### 14.5 Bases jurídicas de los tratamientos

**Q8.** Para cada fila de la matriz del §11, confirmar la base jurídica real (ejecución de contrato / consentimiento / interés legítimo / obligación legal) — hoy todas están marcadas "PENDIENTE" con una sugerencia entre paréntesis, nunca afirmadas como definitivas.
- *Por qué afecta*: es el fundamento exigido por el Art. 6 RGPD para cada tratamiento; sin esto no se puede redactar correctamente la Política de Privacidad.
- *¿Abogado?* Sí, obligatoriamente — es puramente jurídico.
- *Depende técnicamente*: determina qué tratamientos necesitan checkbox de consentimiento explícito (los basados en consentimiento) frente a los que no (contrato/interés legítimo/obligación legal) — decide directamente el diseño del sistema de aceptación de la Fase 2.

### 14.6 Encargados del tratamiento

**Q9.** ¿Existe ya, o hay que firmar, un DPA/Acuerdo de Encargo de Tratamiento con cada proveedor: OpenAI, Resend, Cloudflare (R2), MongoDB Atlas, Render.com?
- *Por qué afecta*: obligatorio (Art. 28 RGPD) cuando un tercero trata datos personales por cuenta del responsable.
- *¿Abogado?* Sí para revisar/negociar términos, aunque varios de estos proveedores ofrecen su propio DPA estándar que solo hay que aceptar (a confirmar cuál aplica a cada cuenta real).
- *Depende técnicamente*: nada de código en general; si algún proveedor exige activar una opción de configuración concreta (p. ej. elegir región de datos), eso sí sería un cambio de infraestructura a coordinar, no de código de producto.

**Q10.** ¿Con qué proveedor(es) ya existe relación contractual firmada, y con cuál falta por completo?
- *Por qué afecta*: puede que alguno ya esté cubierto (p. ej. cuenta OpenAI tipo empresa) y otros no.
- *¿Abogado?* Recomendable para confirmar qué cubre cada contrato ya existente.
- *Depende técnicamente*: nada directo.

### 14.7 OpenAI y tratamiento de datos mediante IA

**Q11.** ¿La cuenta de OpenAI usada es de tipo API estándar o Enterprise/Team con garantías contractuales de no-entrenamiento?
- *Por qué afecta*: determina si se puede afirmar que los datos NO se usan para entrenar modelos de OpenAI — hoy no se puede afirmar nada de esto (ver §5).
- *¿Abogado?* Parcialmente — es sobre todo una confirmación técnica/contractual con OpenAI, pero la redacción final del texto debe validarla un abogado.
- *Depende técnicamente*: nada de código; solo determina qué se puede escribir con seguridad.

**Q12.** ¿Cuánto tiempo conserva OpenAI las imágenes/textos enviados (facturas, fotos de clientes) en sus propios sistemas?
- *Por qué afecta*: afecta al plazo de conservación declarable para estos flujos.
- *¿Abogado?* No para el dato en sí (es contractual/técnico de OpenAI), sí para validar el texto final.
- *Depende técnicamente*: nada.

**Q13.** ¿Hace falta un aviso específico y separado (no solo una mención genérica) antes de subir una foto de un cliente o una factura al escáner con IA?
- *Por qué afecta*: son datos de terceros (DNI/CIF, imagen de un espacio privado) enviados a un proveedor externo — puede requerir más transparencia que el resto.
- *¿Abogado?* Sí.
- *Depende técnicamente*: si la respuesta es sí, hace falta un aviso/consentimiento puntual en la propia pantalla del escáner y en la de "Buscar con IA" (`ia-capacidad-extraer-factura.ts`, `ia-capacidad-describir-trabajo-mercado.ts` + su frontend), no solo en la Política de Privacidad general.

### 14.8 Transferencias internacionales

**Q14.** Confirmar la región real de procesamiento/almacenamiento de cada proveedor: OpenAI (previsiblemente EE.UU.), Resend (a confirmar), Cloudflare R2 (configurable — confirmar la región elegida al crear el bucket), MongoDB Atlas (confirmar región del clúster).
- *Por qué afecta*: si hay transferencia fuera del EEE, hace falta una garantía legal (cláusulas contractuales tipo, decisión de adecuación...) que declarar.
- *¿Abogado?* Sí para confirmar qué garantía aplica y cómo declararla; el dato de la región en sí se puede consultar directamente en los paneles de cada proveedor, sin necesitar abogado para eso.
- *Depende técnicamente*: nada de código — es una comprobación de configuración de infraestructura ya existente.

### 14.9 Retención de datos

**Q15.** ¿Cuánto tiempo se conservan los datos de un cliente/proyecto tras marcarse "finalizado" o "rechazado"?
- *Por qué afecta*: hoy no hay ningún plazo definido — todo se conserva indefinidamente mientras la cuenta exista.
- *¿Abogado?* Sí, especialmente en relación con las facturas (ver Q17).
- *Depende técnicamente*: si se define un plazo, hará falta un proceso de borrado/anonimización automático tras ese plazo — no existe hoy.

**Q16.** ¿Cuánto tiempo se conserva una cuenta de usuario inactiva (nunca eliminada, solo sin uso)?
- *Por qué afecta*: mismo motivo, hoy indefinido.
- *¿Abogado?* Sí.
- *Depende técnicamente*: igual que Q15.

**Q17.** ¿Cuál es el plazo legal mínimo de conservación de facturas/documentos fiscales en España, y prevalece sobre una petición de eliminación de cuenta?
- *Por qué afecta*: relacionado directamente con §14.15 (datos que hay que conservar aunque el usuario pida borrar todo).
- *¿Abogado?* Sí, obligatoriamente (fiscal + RGPD).
- *Depende técnicamente*: sí, mucho — el futuro flujo de "eliminar cuenta" tendría que EXCLUIR las facturas de un borrado inmediato y aplicarles el plazo legal en su lugar.

### 14.10 DNI/NIE de clientes

**Q18.** ¿Es imprescindible pedir el DNI/NIE del cliente para el uso normal de la plataforma, o debería quedar opcional/justificado solo cuando de verdad haga falta (p. ej. un contrato que lo requiera)?
- *Por qué afecta*: principio de minimización de datos (Art. 5.1.c RGPD) — hoy el campo (`ClienteSchema.dni`) existe siempre disponible sin ninguna advertencia sobre cuándo es necesario.
- *¿Abogado?* Recomendable, aunque también es una decisión de producto del propio negocio.
- *Depende técnicamente*: si se restringe su uso, añadir un texto de ayuda/advertencia en el formulario de ficha de cliente.

### 14.11 Firma, IP y User-Agent en aceptación de presupuestos

**Q19.** ¿Es correcto conservar la IP y el User-Agent del cliente que acepta un presupuesto de forma INDEFINIDA, tal como está implementado hoy?
- *Por qué afecta*: es la única IP persistida de todo el sistema, y pertenece a un tercero sin cuenta (el cliente final); el propio esquema (`enlace-presupuesto.model.ts`) documenta esta conservación indefinida como intencional ("es la evidencia de aceptación"), pero nunca se ha validado jurídicamente si es correcto o excesivo.
- *¿Abogado?* Sí.
- *Depende técnicamente*: si hay que limitar el plazo, añadir un proceso de anonimización/borrado de esos dos campos tras ese plazo, sin borrar el resto de la evidencia (firma, fecha).

**Q20.** ¿Hace falta un aviso de privacidad específico en la propia página del Portal público (`/portal/:token`), que hoy no tiene ninguno?
- *Por qué afecta*: el cliente final es un tercero sin cuenta que nunca pasó por el registro ni vio la Política de Privacidad general.
- *¿Abogado?* Sí.
- *Depende técnicamente*: sí — nueva pieza de UI en el Portal (`portal-rutas.ts` + su frontend), independiente del sistema de aceptación de la Fase 2.

### 14.12 Derechos de supresión y portabilidad

**Q21.** ¿Borrado total e inmediato, o periodo de gracia (p. ej. 30 días) antes del borrado definitivo de una cuenta?
- *Por qué afecta*: determina el diseño técnico del flujo (borrado inmediato vs. marcar para borrado diferido).
- *¿Abogado?* Recomendable, aunque también es decisión de producto.
- *Depende técnicamente*: sí — determina si hace falta un estado intermedio "pendiente de borrado" en el usuario (similar en espíritu a `BorradoPendienteModel`, hoy solo para archivos, no para cuentas).

**Q22.** ¿En qué formato debe entregarse la portabilidad de datos (JSON estructurado, PDF legible, ambos)?
- *Por qué afecta*: el Art. 20 RGPD exige un formato "estructurado, de uso común y lectura mecánica" — JSON cumpliría; un PDF por sí solo probablemente no.
- *¿Abogado?* Sí, para confirmar qué formato es jurídicamente suficiente.
- *Depende técnicamente*: sí — determina el diseño del endpoint de exportación.

### 14.13 Exportación de datos

**Q23.** ¿Debe la exportación incluir solo los datos de la propia cuenta (empresa, preferencias) o también todos los datos de los clientes/proyectos gestionados por esa cuenta?
- *Por qué afecta*: son categorías de datos con responsables distintos (el propio usuario vs. terceros que el usuario gestiona) — no está claro si "exportar mis datos" debe incluir los de sus clientes.
- *¿Abogado?* Sí.
- *Depende técnicamente*: sí, cambia completamente el alcance del endpoint a construir.

### 14.14 Borrado completo de cuenta

**Q24.** Al eliminar una cuenta, ¿qué pasa con los datos de sus clientes (terceros)? ¿Se borran también, se anonimizan, o quedan retenidos por alguna obligación del propio usuario (p. ej. facturas que él mismo emitió)?
- *Por qué afecta*: son datos de terceros introducidos por el usuario — borrarlos podría chocar con obligaciones de conservación del propio usuario, no solo de Madera Creativa Estudio.
- *¿Abogado?* Sí, obligatoriamente.
- *Depende técnicamente*: sí, es el diseño central del propio flujo de baja.

**Q25.** ¿Qué pasa con las facturas (ver Q17) si el usuario pide eliminar su cuenta antes de que termine el plazo legal de conservación?
- *Por qué afecta*: conflicto directo entre el derecho de supresión del usuario y una obligación legal de conservación.
- *¿Abogado?* Sí, obligatoriamente.
- *Depende técnicamente*: sí — probablemente exige "anonimizar pero no borrar" ciertos campos en vez de un borrado total.

### 14.15 Datos que debemos conservar por obligaciones legales aunque el usuario pida la eliminación

**Q26.** Listar de forma exhaustiva qué categorías de datos tienen una obligación legal de conservación que prevalece sobre una petición de borrado (facturas con seguridad; ¿evidencia de aceptación de presupuestos?; ¿logs de seguridad?).
- *Por qué afecta*: sin esta lista, el flujo de borrado no puede implementarse de forma segura — podría borrar algo que la ley obliga a conservar, o conservar de más algo que no hace falta.
- *¿Abogado?* Sí, obligatoriamente — lista puramente jurídica/fiscal.
- *Depende técnicamente*: sí, totalmente — es el input necesario para diseñar la lógica de "borrado selectivo" quede pendiente para cuando se construya.

### 14.16 Sistema de aceptación y versionado de documentos

**Q27.** ¿Qué eventos generan una nueva "aceptación" registrada — solo el registro inicial, o también cada publicación de una nueva versión de un documento (¿re-aceptación obligatoria o solo notificación?)?
- *Por qué afecta*: determina el diseño del modelo de versionado (punto 5 del encargo original) y si hace falta un flujo de "hemos actualizado los Términos, acéptalos de nuevo" para usuarios ya existentes.
- *¿Abogado?* Recomendable — hay práctica jurídica establecida sobre cuándo re-pedir consentimiento tras un cambio material.
- *Depende técnicamente*: sí, es el núcleo de la Fase 2.

**Q28.** ¿Qué metadatos técnicos de cada aceptación deben conservarse (IP, User-Agent, timestamp) y durante cuánto tiempo?
- *Por qué afecta*: mismo tipo de decisión que la IP del Portal (Q19) — cuánta evidencia técnica hace falta y durante cuánto tiempo es proporcional.
- *¿Abogado?* Sí.
- *Depende técnicamente*: sí, forma parte del esquema de datos de la Fase 2.

### 14.17 Consentimientos opcionales

**Q29.** ¿Qué consentimientos opcionales concretos hacen falta hoy? El encargo original menciona "comunicaciones comerciales" como ejemplo, pero hoy Madera Creativa Estudio **no envía ningún email de marketing/comercial** — solo el transaccional de recuperación de contraseña (`resend.service.ts`). No se ha encontrado en el código ninguna funcionalidad real que dependa de un consentimiento opcional.
- *Por qué afecta*: si no hay ningún tratamiento opcional real, no hace falta ningún checkbox opcional en el registro.
- *¿Abogado?* No para confirmar que no existe hoy (hecho técnico verificable), sí para confirmar que omitir cualquier consentimiento opcional en esta fase es correcto.
- *Depende técnicamente*: si en el futuro se añade email comercial/newsletter, se necesitará entonces un consentimiento opcional real — hoy no.

### 14.18 Otros puntos marcados PENDIENTE DE VALIDACIÓN LEGAL

**Q30.** Logs de aplicación: ¿contienen incidentalmente datos personales en algún mensaje de error? ¿Hace falta una política de retención de logs propia?
- *Por qué afecta*: los logs (Pino, stdout de Render) no se han auditado campo a campo en esta fase.
- *¿Abogado?* Recomendable si se confirma que sí contienen datos personales.
- *Depende técnicamente*: revisión puntual de los mensajes de log más sensibles (auth, facturación) si se decide auditar esto en detalle.

**Q31.** Suspensión de cuenta por el admin (`estado: 'suspendido'`) frente a baja voluntaria del usuario: ¿debe la suspensión generar también algún aviso o derecho específico al usuario suspendido?
- *Por qué afecta*: hoy revoca el acceso (refresh tokens) pero no borra ni notifica nada — es una acción unilateral del admin, no un ejercicio de derechos del usuario.
- *¿Abogado?* Recomendable.
- *Depende técnicamente*: ninguno urgente, es aclaración de proceso.

**Nota aparte, no jurídica**: la migración del hash de contraseña legado (2/5 cuentas reales aún sin migrar a bcrypt) es un asunto de seguridad ya identificado y en seguimiento (ver memoria del proyecto) — no requiere validación legal, solo que esas cuentas vuelvan a iniciar sesión con éxito para completarse solas.

---

**Nada de la Fase 2 se implementa hasta resolver este bloque.** Sin cambios en producción relacionados con esta fase desde la entrega de la auditoría (30/08/2026).

---

## 15. Entregable de esta fase — resumen

- **Archivos inspeccionados**: todos los modelos de datos (`*.model.ts`), rutas de auth/portal/webauthn, todas las capacidades de IA, servicios de terceros (Resend, R2, push), frontend (`politica-privacidad.tsx`, `use-registro.ts`, `use-auth.ts`, búsqueda de trackers).
- **Documento legal existente**: 1 (Política de Privacidad), con huecos identificados en §1.
- **Documentos legales que faltan por completo**: Aviso Legal, Términos y Condiciones, DPA. Política de Cookies probablemente no necesaria (§9).
- **Funcionalidad crítica inexistente**: borrado/exportación de cuenta (§10).
- **Proveedores confirmados**: OpenAI, Resend, Cloudflare R2, MongoDB Atlas, Render.com, servicios push nativos del navegador. Trimble/SketchUp aparcado, sin datos reales todavía.
- **Ningún cambio de código en esta fase.**

**Siguiente paso propuesto (Fase 2, solo tras confirmar los puntos del §14)**: diseñar el modelo de datos de aceptación/consentimiento versionado + los endpoints y pantallas mínimas para que el registro exija Términos y deje constancia de la Política de Privacidad, sin bloquear el resto del roadmap del producto.
