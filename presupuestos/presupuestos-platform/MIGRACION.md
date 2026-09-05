# Guía de arquitectura y migración

Documento técnico de **Madera Creativa — Gestión de Presupuestos**. Sirve para entender el sistema, retomarlo con otra IA o desplegarlo fuera de Bit.

> La fuente definitiva de la verdad es siempre el código. Este documento resume la arquitectura para orientarse rápido; ante cualquier discrepancia, manda el código real (`presupuestos-service.app-root.ts` para rutas, `cliente.model.ts`/`usuario.model.ts` para modelos).

---

## 1. Arquitectura

```
Navegador
   │
   │  fetch('/api/presupuestos-service/clientes')
   ▼
Frontend React (Vite)          puerto 3000–3100 (desarrollo)
   │  proxy Vite: quita el prefijo /api
   ▼
Gateway de plataforma          puerto 5000 (desarrollo)
   │  regla: /presupuestos-service/*  →  /*
   ▼
presupuestos-service (Express) puerto 5001 (desarrollo)
   │
   ▼
MongoDB Atlas · Cloudflare R2 (archivos)
```

Tres componentes Bit:

| Componente | Tipo | Rol |
|---|---|---|
| `presupuestos-platform` | Plataforma | Compone frontend + gateway + servicio. Unidad desplegable |
| `presupuestos-prototype` | App React | Interfaz web PWA |
| `presupuestos-service` | App Express | API REST y acceso a datos |

**Punto clave del enrutado**: el navegador siempre incluye el prefijo `/api`. El proxy de Vite (desarrollo) y el gateway (producción) lo eliminan antes de llegar al servicio. El servicio nunca ve `/api`.

**Despliegue de producción real**: frontend y backend se despliegan **juntos, como una única unidad, en Render** (`render-build.sh` construye ambos; el servicio Express sirve también los archivos estáticos del frontend ya compilado). El dominio público estable es `estudio.maderacreativa.com`, servido mediante un túnel de Cloudflare con nombre. MongoDB es Atlas en la nube; los archivos (fotos, adjuntos, dibujos, facturas escaneadas, recursos del Motor Documental) se guardan en un bucket de **Cloudflare R2**, no embebidos en MongoDB — ver la sección 5 y los puntos abiertos.

---

## 2. Autenticación

> Esta sección se reescribió por completo el 23/08/2026: la versión anterior describía un esquema de token Base64 con el hash de la contraseña calculado en el cliente — esa arquitectura **ya no existe** y no debe usarse como referencia.

**Flujo actual**:

1. El frontend envía `POST /auth/login` con `{ nombre, password }` — la contraseña viaja **en claro sobre HTTPS**; el hashing ocurre exclusivamente en el servidor.
2. El servidor compara la contraseña contra el hash guardado en la colección `usuarios`, usando **bcrypt** (librería `bcryptjs`, 12 rondas de coste) — el hash resultante incluye la sal, no se guarda por separado.
3. Si es correcta, se emiten dos tokens: un **access token JWT** (firmado HS256, expira en 15 minutos) y un **refresh token** de rotación, guardado en una cookie `httpOnly`. El middleware `requireAuth` valida el access token en cada petición protegida.
4. El refresh token permite renovar el access token sin volver a pedir contraseña, y se revoca de verdad (logout, cambio de contraseña, suspensión o eliminación de cuenta) — no es solo un flag, hay una colección `refreshtokens` dedicada.

**Compatibilidad temporal con hash legado**: la colección `usuarios` tiene un campo `hashAlgo` (`'legacy' | 'bcrypt'`). Las cuentas creadas antes de la migración de seguridad del 06/08/2026 se hashearon con un algoritmo **no criptográfico** (hoy marcado `@deprecated` en `password.service.ts`, solo para verificación de compatibilidad). Cuando una de esas cuentas hace login correctamente, el servidor **re-hashea la contraseña con bcrypt de forma transparente**, sin pedir nada especial al usuario. **Criterio de retirada de este código**: 0 usuarios reales con `hashAlgo: 'legacy'` (o sin el campo, que el código trata igual) — comprobado por consulta directa a producción antes de eliminar nada. A fecha de esta revisión, quedan 2 usuarios reales pendientes de esa migración (ver Puntos abiertos).

**Autenticación biométrica (WebAuthn/passkeys)**: alternativa al login por contraseña, no un sustituto. El navegador/sistema operativo del dispositivo hace la verificación biométrica (huella, Face ID, Windows Hello); la aplicación nunca ve ni guarda el dato biométrico, solo una credencial firmada (`@simplewebauthn/server` en el backend). Requiere sesión previa por contraseña para registrar el primer dispositivo desde Ajustes.

**Estados de cuenta**

| Estado | Comportamiento en login |
|---|---|
| `pendiente` | 403 — cuenta a la espera de aprobación del administrador |
| `activo` | Acceso concedido |
| `suspendido` | 403 — acceso revocado |

El hook `use-licencia.ts` revalida el estado periódicamente y cierra la sesión si la cuenta deja de estar activa.

---

## 3. Aislamiento de datos (multi-tenant)

**Toda** consulta a los modelos de datos del usuario (`ClienteModel`, `ProyectoModel`, `FacturaModel`, `EmpresaModel`, y el resto de colecciones de negocio) filtra por `usuarioId`. Los métodos de `PresupuestosService` reciben `usuarioId` como parámetro obligatorio:

```ts
async listarClientes(usuarioId: string): Promise<ClienteDoc[]> {
  const docs = await ClienteModel.find({ usuarioId }).lean().exec();
  return docs;
}
```

Consecuencia: **una cuenta nueva arranca siempre vacía**.

> `migrarDatosAdmin()` (backfill de `usuarioId` en documentos históricos de antes del multiusuario) **se retiró el 19/08/2026** — hacía un escaneo completo sin índice en cada arranque del servidor, sin encontrar nunca nada que migrar desde hacía tiempo, compitiendo por recursos justo al arrancar. No sustituye al principio de aislamiento anterior, que sigue vigente; solo se eliminó la migración puntual, ya innecesaria.

**Cliente ≠ Proyecto** (separación introducida el 20/08/2026): `Cliente` es solo identidad (nombre, teléfono, email) — un cliente puede tener varios `Proyecto` (expedientes de trabajo), cada uno con su propia gestión económica y documental (gastos, ingresos, mediciones, tareas, fotos, adjuntos, estado). Antes de este cambio, ambos vivían mezclados en un único documento, lo que mezclaba los datos de distintos trabajos del mismo cliente.

---

## 4. API REST

Todas las rutas devuelven JSON. Las marcadas con 🔒 exigen `Authorization: Bearer <token>` (middleware `requireAuth`). Tabla organizada por área funcional — **la lista exhaustiva y siempre actualizada de rutas está en `presupuestos-service.app-root.ts`** (y en los routers montados aparte: `webauthn-rutas.ts`, `portal-rutas.ts`, `resena-rutas.ts`, `ia-rutas.ts`); este documento no pretende sustituirlo.

### Salud
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/healthz`, `/` | Comprobación de vida del servicio |

### Autenticación y sesión
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/auth/registrar` | Alta de usuario — queda en estado `pendiente` |
| POST | `/auth/login` | Devuelve access token + refresh token (cookie) |
| POST | `/auth/refresh` | Renueva el access token con el refresh token |
| POST | `/auth/logout` | Revoca el refresh token actual |
| POST | `/auth/verificar` | Comprueba si una sesión sigue activa |
| GET 🔒 | `/auth/yo` | Devuelve el `usuarioId` del token actual |
| POST/GET/DELETE | `/auth/webauthn/*` | Registro y login biométrico (opciones/verificar/credenciales) |

### Administración
| Método | Ruta | Descripción |
|---|---|---|
| GET/PUT/DELETE 🔒 | `/admin/usuarios`, `/admin/usuarios/:id/estado`, `/admin/usuarios/:id/acceso` | Gestión de cuentas (estado, plan de acceso) |
| GET/POST/PUT/DELETE 🔒 | `/admin/codigos` | Códigos promocionales |
| GET/POST/PUT/DELETE 🔒 | `/admin/costes` | Costes de infraestructura (panel admin) |

### Clientes y proyectos
| Método | Ruta | Descripción |
|---|---|---|
| GET/POST/PUT/DELETE 🔒 | `/clientes`, `/clientes/:id` | Identidad del cliente |
| GET 🔒 | `/clientes/:id/proyectos` | Proyectos de un cliente |
| POST 🔒 | `/clientes/:id/resena-enlace` | Genera/regenera el enlace de reseña de Google de ese cliente |
| GET/POST/PUT/DELETE 🔒 | `/proyectos`, `/proyectos/:id` | Expediente de trabajo (estado, movimientos, tareas, presupuesto estimado) |
| GET 🔒 | `/proyectos/resumen`, `/proyectos/:id/adjuntos` | Vistas agregadas |

### Empresa, perfil y notificaciones
| Método | Ruta | Descripción |
|---|---|---|
| GET/PUT 🔒 | `/empresa` | Datos fiscales, logo, enlace/imagen de reseña |
| GET/PUT 🔒 | `/perfil` | Nombre para mostrar y preferencias propias |
| PUT 🔒 | `/perfil/acceso` | Cambio de usuario/contraseña de acceso |
| GET/PUT 🔒 | `/notificaciones/preferencias`, `/notificaciones/recordatorios` | Interruptores y horarios por tipo de notificación |
| GET | `/push/vapid-public-key` | Clave pública VAPID |
| POST 🔒 | `/push/subscribe`, `/push/probar` | Suscripción y prueba de notificación push |

### Facturas y economía
| Método | Ruta | Descripción |
|---|---|---|
| GET/PUT/DELETE 🔒 | `/facturas`, `/facturas/:id` | Facturas (ingreso/gasto) |
| GET 🔒 | `/facturas/resumen`, `/facturas/resumen-proveedores`, `/facturas/anios`, `/facturas/documentacion-asesor` | Vistas agregadas y exportación fiscal |
| POST 🔒 | `/facturas/descargar-zip` | Descarga masiva |
| GET 🔒 | `/facturas/:id/pdf` | PDF de una factura |
| GET/PUT/DELETE 🔒 | `/gastos-periodicos` | Gastos deducibles periódicos/estimados |
| GET/PUT/DELETE 🔒 | `/proveedores`, `/productos` | Catálogos |

### Motor Documental
| Método | Ruta | Descripción |
|---|---|---|
| GET/PUT/DELETE 🔒 | `/presupuestos`, `/presupuestos/:id` | Presupuestos (formato legado "lienzo" o "documento") |
| POST 🔒 | `/presupuestos/:id/aceptar`, `/presupuestos/:id/enlace` | Aceptación de negocio y enlace público (Portal del Cliente) |
| PUT 🔒 | `/presupuestos/:id/cobros` | Registro de cobros |
| GET/PUT/DELETE 🔒 | `/contratos` | Segundo tipo de documento del Motor Documental |
| GET/PUT/DELETE 🔒 | `/plantillas`, `/recursos`, `/componentes` | Biblioteca del Motor Documental |
| GET/PUT/DELETE 🔒 | `/notas`, `/codigos-qr` | Otros documentos ligeros |
| GET/PUT/DELETE 🔒 | `/automatizaciones` | Backend de automatización por eventos — **sin interfaz de usuario todavía**, ver Puntos abiertos |

### Portal público y reseñas (sin sesión de usuario)
| Método | Ruta | Descripción |
|---|---|---|
| GET/POST | `/portal/presupuestos/:token`, `/portal/presupuestos/:token/aceptar` | Vista y aceptación pública de un presupuesto por enlace |
| GET | `/resena/:token` | Redirección a la reseña de Google del cliente |

### Dibujos
| Método | Ruta | Descripción |
|---|---|---|
| GET/PUT/DELETE 🔒 | `/dibujos`, `/dibujos/:id` | Sistema actual de dibujos (colección `Dibujo` propia — no confundir con la antigua `PizarraMedidas`, retirada) |
| POST 🔒 | `/dibujos/:id/duplicar` | Duplicar un dibujo |
| GET/POST/PUT/DELETE 🔒 | `/carpetas` | Organización en carpetas |

### Asistente de IA
| Método | Ruta | Descripción |
|---|---|---|
| POST/GET 🔒 | `/ia/generar`, `/ia/generar/:trabajoId` | Genera contenido con IA (asíncrono, con sondeo) |
| POST 🔒 | `/ia/herramientas/ejecutar` | Ejecuta una herramienta de una capacidad de IA |

### Archivos
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/imagen-proxy` | Sirve imágenes de R2 a través del servidor (evita inestabilidad del dominio público directo) |
| GET | `/almacenamiento/:carpeta/:id` | Acceso a un archivo por clave de almacenamiento |

---

## 5. Modelos de datos

Visión arquitectónica, no un listado completo de campos (para eso, `usuario.model.ts` y `cliente.model.ts` son la fuente definitiva).

| Modelo | Colección | Rol |
|---|---|---|
| `Usuario` | `usuarios` | Cuenta de acceso: `passwordHash` + `hashAlgo` (`bcrypt`/`legacy`), estado, flag admin, suscripciones push |
| `Cliente` | `clientes` | Identidad del cliente — solo contacto, sin datos de un trabajo concreto |
| `Proyecto` | `proyectos` | Expediente de trabajo de un cliente: economía, mediciones, tareas, fotos, adjuntos, estado |
| `Empresa` | `empresas` | Datos fiscales, logo, configuración de reseñas por cuenta |
| `Factura` | `facturas` | Ingresos/gastos, con datos fiscales ampliados (IGIC/IVA, base imponible) |
| `GastoPeriodico` | `gastoperiodicos` | Gastos deducibles periódicos/estimados |
| `Proveedor`, `Producto` | `proveedors`, `productos` | Catálogos |
| `Nota`, `CodigoQR` | `notas`, `codigoqrs` | Documentos ligeros |
| `RefreshToken` | `refreshtokens` | Sesiones de refresh, revocables |
| `CredencialWebAuthn` | `credencialwebauthns` | Dispositivos biométricos registrados |
| `CodigoPromocional` | `codigopromocionals` | Códigos de acceso/plan |
| `CosteInfraestructura` | `costeinfraestructuras` | Panel admin de costes |
| `EnlaceResena`, `EnlacePresupuesto` | `enlaceresenas`, `enlacepresupuestos` | Enlaces públicos con token (reseñas, Portal del Cliente) |
| `Dibujo`, `Carpeta` | `dibujos`, `carpetas` | Sistema actual de dibujo/anotación por cliente |
| `IaUso` | `iausos` | Telemetría de uso de IA (proveedor/modelo/coste) — no confundir con el subsistema de "Memoria de IA", retirado (ver Historial) |
| `Automatizacion` | `automatizacions` | Automatización por eventos del Motor Documental — backend activo, sin interfaz aún |

**Motor Documental** (modelos `Presupuesto`, `Contrato`, `Plantilla`, `Recurso`, `Componente` — colecciones `presupuestos`, `contratos`, `plantillas`, `recursos`, `componentes`): sistema de documentos con estructura propia (`DocumentoMC`), independiente de cualquier motor de edición externo. El detalle completo de su arquitectura vive en `ARQUITECTURA-MOTOR-DOCUMENTAL.md`; no se duplica aquí.

**Almacenamiento de archivos**: fotos, adjuntos, dibujos y recursos no se guardan embebidos en MongoDB — se suben a **Cloudflare R2** y el documento solo guarda la URL/clave. Dominio actual: `cdn.maderacreativa.com` (vía la variable `R2_PUBLIC_URL_BASE`). Existe todavía un dominio R2 anterior, de desarrollo, al que siguen apuntando algunos recursos guardados antes de la migración de dominio — ver Puntos abiertos.

---

## 6. Convenciones del frontend

| Aspecto | Regla |
|---|---|
| Moneda | Formato europeo sin abreviar — `1.234,56 €` |
| Fechas | `dd/mm/yyyy` mediante `formatoFecha()` en `calculos.ts` |
| Entrada numérica | `ImporteInput` acepta coma y punto (los `input type="number"` nativos rechazan la coma) |
| Estilos | CSS Modules exclusivamente. Nada de CSS global |
| Navegación móvil | Barra inferior fija de 72 px |
| Z-index | Escala centralizada en `z-index.ts` (`Z_DESPLEGABLE`, `Z_BARRA_FLOTANTE`, `Z_MODAL`, `Z_PANTALLA_COMPLETA`) — evita que un modal o capa nueva quede detrás de otra sin que nadie lo haya decidido a propósito |
| Interfaz | Las acciones globales van en la cabecera, **salvo el editor del Motor Documental**, que usa deliberadamente una barra de herramientas flotante (interacción tipo Canva) — no es una excepción accidental, es el diseño elegido para ese editor concreto |

### Hooks principales

| Hook | Responsabilidad |
|---|---|
| `use-auth.ts` | Sesión, tokens, login y logout |
| `use-biometria.ts` | Registro y login por WebAuthn |
| `use-clientes.ts` | Carga diferida del conjunto de clientes tras autenticar |
| `use-facturas.ts` | Ingresos y gastos |
| `use-empresa.ts` | Datos fiscales y de reseñas por usuario |
| `use-licencia.ts` | Revalida el estado de la cuenta periódicamente |
| `use-push.ts` | Registra el service worker y la suscripción push |
| `use-registro.ts` | Alta de nuevos usuarios |
| `use-dibujos.ts` | Sistema actual de dibujos (carpetas, mover entre proyectos) |

---

## 7. Desplegar fuera de Bit

El proyecto está pensado para desplegarse como una unidad con `bit run presupuestos-platform`, pero puede separarse.

### Backend en Railway o Render

1. Extrae la carpeta `presupuestos/presupuestos-service`.
2. Sustituye los imports de paquetes Bit (`@madera-creativa/presupuestos.*`) por rutas relativas.
3. Dependencias de producción reales (ver `package.json` para versiones exactas): `express`, `cors`, `mongoose`, `web-push`, `bcryptjs`, `jsonwebtoken`, `@simplewebauthn/server`, `helmet`, `express-rate-limit`, `zod`, `@aws-sdk/client-s3`, `cookie-parser`, `dotenv`, `openai`, `pdf-lib`, `jszip`, `pino`.
4. Comando de arranque real: `node dist/render-entry.js` (compilado con `tsc -p tsconfig.json`).
5. Configura todas las variables de `env.example` en el panel del proveedor — **nunca copies valores reales de producción a este documento ni a ningún archivo del repositorio**. Variables obligatorias en producción: conexión a MongoDB, credenciales de administrador inicial, las 5 de Cloudflare R2, y las de JWT/sesión que declare `env.example`. Opcionales: VAPID (push), OpenAI (asistente de IA).

### Frontend en Netlify o Vercel

1. Extrae la carpeta `presupuestos/presupuestos-prototype`.
2. Comando de build real: `vite build --config vite.config.render.js`. Directorio de salida: `dist-render` (en el despliegue combinado actual) o `dist` si se usa la config genérica.
3. Sustituye el proxy de desarrollo por una variable que apunte a la URL pública del backend.
4. Añade una redirección SPA: todas las rutas a `/index.html`.

### Base de datos y almacenamiento

MongoDB Atlas y el bucket de Cloudflare R2 ya están en la nube. Solo hay que añadir las IP de los nuevos servidores a la lista blanca de red del clúster, y configurar las 5 variables `R2_*` para el nuevo despliegue.

> **Aislamiento dev/test/producción**: el propio código incluye una salvaguarda (`verificarAislamientoEntorno` en `mongo-conexion.ts`) que impide conectar accidentalmente a la base de datos de producción conocida sin `NODE_ENV=production` o el escape explícito `ALLOW_PROD_DB=true`. Cualquier entorno de pruebas nuevo debe usar su propia base de datos aislada, nunca la de producción.

---

## 8. Puntos abiertos

Pendientes reales confirmados a fecha de esta revisión — no se listan aquí temas ya cerrados.

| Tema | Estado |
|---|---|
| Portal del Cliente — plantilla profesional | El presupuesto que ve/firma el cliente todavía usa texto plano, no el Motor Documental (membrete, varias hojas). Marcado como prioritario. |
| Facturas / Escáner / Trimestral | Auditoría de Fase 0 (técnica y fiscal) ya entregada; a la espera de autorización para empezar a programar la ampliación. |
| Automatizaciones | Backend completo, probado y activo en producción (se suscribe al bus de eventos en cada arranque); **sin interfaz de usuario** — decisión explícita de mantenerlo así hasta que se decida construir esa interfaz. |
| Migración del hash de contraseña legado | 2 de los usuarios reales siguen dependiendo del hash no criptográfico anterior a bcrypt. Se migran solos con un login correcto (proceso transparente ya activo); no se ha forzado ningún cambio de contraseña. El código de compatibilidad se retirará solo cuando ese número llegue a 0, verificado por consulta directa. |
| `ORIGEN_R2_LEGADO` | Aproximadamente 22 recursos reales (facturas, recursos del Motor Documental, alguna foto de proyecto) siguen guardados con URLs del dominio de desarrollo antiguo de R2. Hace falta migrar esas referencias al dominio actual antes de poder retirar la compatibilidad (hoy duplicada en 3 sitios del código: CSP, proxy de imágenes, y el detector del frontend). |
| Editor de presupuestos "lienzo" (`editor-presupuesto-lienzo.tsx`) | Formato antiguo de presupuestos (previo al Motor Documental), pendiente de auditoría propia y decisión — solo se puede retirar con seguridad si se confirma que no queda ningún presupuesto real guardado en ese formato. |
| **Limpieza de R2 al borrar presupuestos/contratos** (deuda técnica, cuota de almacenamiento, 05/09/2026) | `borrarPresupuesto`/`borrarContrato` borran el documento de Mongo pero **nunca limpian sus archivos en R2** (imágenes embebidas del Motor Documental, imágenes del lienzo legado, firma del cliente) — quedan huérfanos en el bucket. Detectado y dejado sin corregir a propósito al implementar la cuota de almacenamiento por plan (fuera de alcance de esa tarea). **PENDIENTE — no resuelto. Prioridad: media.** |
| **Limpieza de blobs antiguos al reemplazar fotos/adjuntos/lienzo** (deuda técnica, cuota de almacenamiento, 05/09/2026) | Si una foto/adjunto/archivo de lienzo se "reemplaza" conservando el mismo id de subdocumento, el blob anterior en R2 nunca se identifica como huérfano (la comparación de limpieza es por id, no por contenido) y no se borra. El backfill de cuota (`almacenamiento-backfill.ts`) corrige el **contador** (lo recalcula desde los documentos actuales), pero eso no limpia el objeto físico en R2 — sigue ocupando espacio real en el bucket aunque ya no cuente contra la cuota de nadie. Detectado y dejado sin corregir a propósito. **PENDIENTE — no resuelto. Prioridad: media.** |
| **Robustez del rollback concurrente en sustituciones de cuota** (deuda técnica, cuota de almacenamiento, 05/09/2026) | Al deshacer una reserva de cuota tras un fallo (`asociarModelo3DArchivoProyecto`/`guardarDibujo` en `presupuestos-service.ts`), existe una ventana extremadamente estrecha en la que otra subida concurrente podría ocupar el espacio recién liberado antes de que el rollback intente volver a reservarlo — en ese caso el rollback solo registra el fallo en el log (`logger.error`), sin reintentar. No rediseñado a propósito; queda como mejora de robustez futura. **PENDIENTE — no resuelto. Prioridad: baja/media.** |
| **`factura-seguridad.spec.ts` — fallo intermitente preexistente** (deuda técnica de tests, detectado 05/09/2026) | Un test de este archivo (unicidad global de `id` de `Factura`) falla de forma intermitente al ejecutar la suite completa de `presupuestos-service` — carrera de índices de Mongo/conexión global compartida entre archivos de test (`mongodb-memory-server`), no un fallo de la lógica de negocio real. Reproducido de forma independiente también SIN los cambios de la cuota de almacenamiento, así que no lo causa esa función. No modificado a propósito. **PENDIENTE — no resuelto. Debe retomarse en una futura fase de estabilización de tests. Prioridad: media.** |
| **Límite cuantitativo de uso de IA** (deuda técnica, prueba gratuita de 60 días, 05/09/2026) | No existe ningún límite de CANTIDAD de uso de IA para ningún plan (solo de CAPACIDAD — qué función puede usar cada plan). `IaUsoModel` es telemetría de solo-inserción, deliberadamente sin límites "para conocer el comportamiento real antes de aplicar ninguno". El trial hereda las mismas capacidades que PRO, incluido este mismo hueco — no es un riesgo nuevo, pero sí uno amplificado (crear una cuenta de trial no exige pago). **PENDIENTE — revisar antes de escalar comercialmente. Prioridad: media/alta según volumen real.** |
| **Integración de pagos (Stripe)** (deuda técnica, prueba gratuita de 60 días, 05/09/2026) | No implementada a propósito en esta fase. El punto de integración recomendado y el flujo TRIAL→plan de pago quedan documentados en esta misma entrada del historial de decisiones — ver más abajo. **PENDIENTE.** |
| **Aceptación legal de Términos y Privacidad en el registro** (deuda técnica, ya rastreada — `AUDITORIA-LEGAL-PRIVACIDAD.md`) | El registro sigue sin ningún checkbox de aceptación ni registro de consentimiento versionado — Fase 2 legal, pausada explícitamente pendiente de validación jurídica (ver `project_legal_privacidad_pausado.md`). No bloquea técnicamente el trial, pero si se van a cobrar tarjetas reales más adelante, conviene resolverla antes del lanzamiento público. **PENDIENTE — no resuelto por esta implementación, ni se pretendía.** |
| **Política definitiva de códigos promocionales para usuarios de pago (caso E)** (deuda técnica, prueba gratuita de 60 días, 05/09/2026) | Hoy `/codigos/canjear` bloquea sin excepción cualquier canje de una cuenta con `tipo:'paid'` (nunca hay downgrade silencioso), pero no existe ninguna forma de permitir un canje legítimo (p. ej. un código que conceda un plan IGUAL o SUPERIOR al que ya paga). Bloqueado deliberadamente en vez de intentar comparar "valor" de planes automáticamente. **PENDIENTE — decidir si hace falta una política más fina.** |
| **Revisión de abuso de trials (múltiples cuentas/emails)** (deuda técnica, prueba gratuita de 60 días, 05/09/2026) | No se ha construido ninguna medida contra crear varias cuentas de trial con variaciones del mismo email, ni contra varias cuentas de la misma empresa. Riesgo de coste bajo por cuenta individual — no imprescindible para el lanzamiento inicial. **PENDIENTE — mitigación futura si el volumen real lo justifica.** |
| **Ventana de caché de hasta 60 segundos en el plan efectivo** (comportamiento aceptado explícitamente, no un defecto — documentado, 05/09/2026) | `obtenerPlanUsuario()` cachea el plan calculado hasta 60 segundos — un trial que expira en ese instante puede tardar hasta 60s en reflejarse en una petición que ya tenía el valor en caché. Aceptado explícitamente por el usuario; no requiere ninguna acción, solo queda documentado aquí para que no se interprete como un fallo. |

---

## 9. Historial de decisiones

- **Migración de seguridad de autenticación** (06/08/2026) — sustituido el token Base64 sin firma por JWT + refresh token con rotación y revocación real; sustituido el hash de contraseña no criptográfico por bcrypt, calculado solo en servidor, con migración transparente de cuentas existentes.
- **Adopción de Cloudflare R2** (16/08/2026) como almacenamiento de archivos, en sustitución de guardarlos embebidos en base64 dentro de MongoDB.
- **WebAuthn / login biométrico** — implementado y en uso.
- **Separación Cliente ≠ Proyecto** (20/08/2026) — un cliente (identidad) puede tener varios proyectos (expedientes de trabajo), cada uno con su propia gestión económica y documental independiente.
- **Motor Documental** — sistema propio de documentos estructurados (`DocumentoMC`), sustituyendo gradualmente al editor "lienzo" basado en una librería externa de dibujo; arquitectura detallada en `ARQUITECTURA-MOTOR-DOCUMENTAL.md`.
- **`migrarDatosAdmin()` retirada** (19/08/2026) — backfill puntual ya sin ningún efecto real, eliminado por coste de arranque innecesario.
- **Retirada de la antigua pizarra de medidas** (`PizarraMedidas`/`TabMediciones`, 23/08/2026) — sustituida en la práctica por el sistema actual de Dibujos; se confirmó antes, por consulta directa a producción, que no quedaba ningún dato real en el formato antiguo.
- **Retirada del subsistema de "Memoria de IA"** (23/08/2026) — código completo y probado a nivel de unidad, pero sin ningún consumidor real ni interfaz; los datos encontrados en su colección eran de una única prueba de verificación, no de uso real.
- **OCR con Tesseract.js retirado** — provocaba un fallo de inicialización del bundle en producción. Sustituido por un escáner propio multipágina con filtros de imagen.
- **Sin renderizado en servidor** — la app depende de `localStorage`, Canvas 2D y Web Speech API, todas de cliente.
- **Credenciales por variables de entorno** — nunca escritas en el código.
- **Plataforma combinada** — frontend y backend se despliegan juntos para simplificar la operación.
- **Modelo 3D y SketchUp Desktop — decisión definitiva de plan** (05/09/2026): Modelo 3D y SketchUp Desktop son funciones PRO/PREMIUM. BASIC no dispone de ellas. Madera Creativa Estudio utiliza el nombre textual "SketchUp Desktop" únicamente para identificar el software externo/enlace correspondiente y no se presenta como afiliada, patrocinada ni partner de Trimble. Corrige un hallazgo de la auditoría comercial previa: antes solo se bloqueaba en el frontend el enlace "Ver en SketchUp"; subir/reemplazar/ver el modelo 3D quedaban libres para cualquier plan. Ahora `requirePlan(PRO_O_SUPERIOR)` protege `POST /proyectos/:id/modelo3d` y `POST /proyectos/:id/modelo3d/archivo`, y `ocultarModelo3DSiNoPro` (`planes.ts`) impide que el campo `modelo3D` llegue en la respuesta a una cuenta sin PRO+ aunque el proyecto ya tuviera uno de antes de un downgrade. `DELETE /proyectos/:id/modelo3d` queda deliberadamente sin gate (quitar/liberar datos propios nunca se bloquea por plan). Todo texto que mencione "SketchUp Desktop" en la interfaz lleva junto el aviso "SketchUp es una marca de Trimble Inc. Madera Creativa Estudio no está afiliada ni patrocinada por Trimble." — nunca detrás de un tooltip, nunca solo en una página legal general.

### Historial de decisiones — Trial 60 días (05/09/2026)

Modelo comercial definitivo implementado:

- **Duración**: exactamente **60 días** (`DURACION_TRIAL_DIAS`, `planes.ts` — único punto de verdad de este número en todo el proyecto).
- **Empieza al verificar el email** (`POST /auth/verificar-email`), nunca en el registro — una cuenta que nunca verifica su email nunca consume ningún día de trial. Solo se concede si la cuenta sigue exactamente en `ACCESO_POR_DEFECTO` en ese momento (nunca si el registro ya trajo un código promocional válido — el código prevalece siempre, nunca se suman los dos).
- **Incluye Basic + Pro completos, nunca Premium**: técnicamente, `acceso.plan = 'PRO'` durante el trial — reutiliza el 100% del motor de planes ya existente (`requirePlan`, `capacidadPermitidaParaPlan`, cuota de almacenamiento) sin ningún cambio en esas piezas.
- **25 GB de almacenamiento durante el trial** — consecuencia directa de que el plan efectivo sea PRO; cero cambios en `almacenamiento-cuota.ts`.
- **Sin tarjeta**: no se ha tocado ni implementado ningún flujo de pago (Stripe queda fuera de esta fase, a propósito).
- **Usuario identificado, nunca anónimo**: email + contraseña siguen siendo obligatorios y la verificación de email se mantiene sin cambios — el trial no relaja ese requisito.
- **`acceso.tipo = 'trial'`, `acceso.origen = 'trial'`** (nuevo valor añadido a los enums `TipoAcceso`/`OrigenAcceso` de `usuario.model.ts` — `'trial'` ya existía en `TipoAcceso` desde antes, se añadió a `OrigenAcceso`). `acceso.plan = 'PRO'`, `activadoEn`/`expiraEn` reales.
- **NONE nunca representa el trial** — sigue significando exactamente lo mismo que antes ("sin ningún plan comercial asignado"). El trial usa `plan:'PRO'` + `tipo:'trial'`, nunca `plan:'NONE'` con campos aparte (Opción B de la auditoría, descartadas A y C por invasivas).
- **Plan efectivo, fuente única**: `calcularPlanEfectivo()` (`planes.ts`) — si `acceso.expiraEn` está definido y ya pasó, el plan efectivo es `NONE` sin importar qué diga `acceso.plan` guardado (nunca se sobrescribe en Mongo — se conserva el historial). La usan `obtenerPlanUsuario` (autorización, con caché de 60s) y `obtenerEstadoAccesoUsuario` (display, sin caché). Esta misma función, de paso, **corrige un hallazgo de la auditoría previa**: los códigos promocionales con `duracionDias` nunca comprobaban su propia expiración — ahora sí, de forma unificada con el trial.
- **Bloqueo tras los 60 días (Opción 3 de la auditoría)**: `requireAuth` (`presupuestos-service.app-root.ts`) rechaza con 403 `sin_plan_activo` cualquier ruta de negocio para una cuenta con plan efectivo `NONE`, EXCEPTO las de `RUTAS_EXENTAS_BLOQUEO_PLAN` (`/auth/yo`, `/auth/logout`, `/auth/verificar`, `/perfil`, `/perfil/acceso`, `/codigos/canjear`, `/almacenamiento/uso`) — protección real de backend, aplicada automáticamente a TODAS las rutas que ya pasan por `requireAuth` (un único punto de cambio, no ruta por ruta). Nunca se borra ningún dato al bloquear.
- **Códigos promocionales**: nuevo usuario con código → el código sustituye al trial automático (nunca se suman). Trial activo o ya terminado + código → se permite canjear (recupera/sustituye el acceso). Usuario con `tipo:'paid'` + código → bloqueado sin excepción (nunca downgrade silencioso) — caso documentado como pendiente si se necesitara una política más fina en el futuro (ver § 8).
- **Admin**: sin cambios — su bypass (`usuarioId === 'admin'`) sigue cortando antes de llegar a ningún cálculo de plan efectivo, en `requireAuth`, `requirePlan` y `capacidadPermitidaParaPlan`.
- **Sin trial retroactivo**: `iniciarTrialSiCorresponde()` solo se invoca desde `/auth/verificar-email`; no existe ningún backfill que conceda trials a cuentas existentes.
- **Planes comerciales de referencia** (mostrados en la interfaz, sin cobro real todavía): BASIC 19 €/mes, PRO 39 €/mes, PREMIUM 59 €/mes.
- **Pagos**: fuera de esta fase por completo — sin Stripe, sin checkout, sin ningún estado simulado de "pago realizado". La pantalla de fin de trial muestra los tres planes con un botón deshabilitado ("Próximamente").

---

**Última revisión de este documento: 05/09/2026** (añadidos 4 puntos abiertos de la implementación de cuota de almacenamiento por plan — ver § 8 —, la decisión definitiva de plan de Modelo 3D/SketchUp Desktop, y la implementación completa de la prueba gratuita de 60 días — ver § 8 y § 9).
