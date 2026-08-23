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

---

**Última revisión de este documento: 23/08/2026.**
