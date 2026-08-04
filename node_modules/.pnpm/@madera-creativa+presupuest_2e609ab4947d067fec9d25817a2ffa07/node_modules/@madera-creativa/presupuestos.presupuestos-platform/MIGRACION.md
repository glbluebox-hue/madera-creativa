# Guía de arquitectura y migración

Documento técnico de **Madera Creativa — Gestión de Presupuestos**. Sirve para entender el sistema, retomarlo con otra IA o desplegarlo fuera de Bit.

---

## 1. Arquitectura

```
Navegador
   │
   │  fetch('/api/presupuestos-service/clientes')
   ▼
Frontend React (Vite)          puerto 3000–3100
   │  proxy Vite: quita el prefijo /api
   ▼
Gateway de plataforma          puerto 5000
   │  regla: /presupuestos-service/*  →  /*
   ▼
presupuestos-service (Express) puerto 5001
   │
   ▼
MongoDB Atlas
```

Tres componentes Bit:

| Componente | Tipo | Rol |
|---|---|---|
| `presupuestos-platform` | Plataforma | Compone frontend + gateway + servicio. Unidad desplegable |
| `presupuestos-prototype` | App React | Interfaz web PWA |
| `presupuestos-service` | App Express | API REST y acceso a datos |

**Punto clave del enrutado**: el navegador siempre incluye el prefijo `/api`. El proxy de Vite (desarrollo) y el gateway (producción) lo eliminan antes de llegar al servicio. El servicio nunca ve `/api`.

---

## 2. Autenticación

Esquema simple basado en token Base64, sin JWT.

1. El frontend envía `POST /auth/login` con `{ nombre, passwordHash }`.
2. El servicio valida contra la colección `usuarios` de MongoDB.
3. Devuelve un token que el frontend guarda en `localStorage` bajo la clave `mc-auth-token`.
4. Cada petición posterior incluye la cabecera `Authorization: Bearer <token>`.
5. El middleware `requireAuth` resuelve el token a un `usuarioId` y lo adjunta a `req`.

El administrador usa un token fijo por compatibilidad con sesiones antiguas; el resto de usuarios reciben un token derivado de su `id`.

**Estados de cuenta**

| Estado | Comportamiento en login |
|---|---|
| `pendiente` | 403 — cuenta a la espera de aprobación del administrador |
| `activo` | Acceso concedido |
| `suspendido` | 403 — acceso revocado |

El hook `use-licencia.ts` revalida el estado cada 120 segundos y cierra la sesión si la cuenta deja de estar activa.

---

## 3. Aislamiento de datos (multi-tenant)

**Toda** consulta a `ClienteModel`, `FacturaModel` y `EmpresaModel` filtra por `usuarioId`. Los métodos de `PresupuestosService` reciben `usuarioId` como parámetro obligatorio:

```ts
async listarClientes(usuarioId: string): Promise<ClienteDoc[]> {
  const docs = await ClienteModel.find({ usuarioId }).lean().exec();
  return docs;
}
```

Al arrancar, `migrarDatosAdmin()` asigna `usuarioId: 'admin'` a cualquier documento histórico que no lo tenga. Es idempotente: solo toca registros sin el campo.

Consecuencia: **una cuenta nueva arranca siempre vacía**.

---

## 4. API REST

Todas las rutas devuelven JSON. Las marcadas con 🔒 exigen `Authorization: Bearer <token>`.

### Salud
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/` | Comprobación de vida del servicio |

### Autenticación
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/auth/registrar` | Alta de usuario — queda en estado `pendiente` |
| POST | `/auth/login` | Devuelve token, id, nombre, estado y flag de admin |
| POST | `/auth/verificar` | Comprueba si una sesión sigue activa |
| GET 🔒 | `/auth/yo` | Valida el token actual y devuelve el `usuarioId` |

### Administración
| Método | Ruta | Descripción |
|---|---|---|
| GET 🔒 | `/admin/usuarios` | Lista todos los usuarios con estado y fechas |
| PUT 🔒 | `/admin/usuarios/:id/estado` | Aprueba, suspende o reactiva una cuenta |
| DELETE 🔒 | `/admin/usuarios/:id` | Elimina un usuario |

### Clientes
| Método | Ruta | Descripción |
|---|---|---|
| GET 🔒 | `/clientes` | Lista los clientes del usuario |
| GET 🔒 | `/clientes/:id` | Ficha completa de un cliente |
| PUT 🔒 | `/clientes/:id` | Crea o actualiza un cliente |
| DELETE 🔒 | `/clientes/:id` | Elimina un cliente |

### Facturas
| Método | Ruta | Descripción |
|---|---|---|
| GET 🔒 | `/facturas` | Lista facturas ordenadas por fecha de creación |
| GET 🔒 | `/facturas/:id` | Detalle de una factura |
| PUT 🔒 | `/facturas/:id` | Crea o actualiza una factura |
| DELETE 🔒 | `/facturas/:id` | Elimina una factura |

### Empresa
| Método | Ruta | Descripción |
|---|---|---|
| GET 🔒 | `/empresa` | Datos fiscales y logo del usuario (se crea vacío si no existe) |
| PUT 🔒 | `/empresa` | Guarda los datos de empresa |

### Notificaciones push
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/push/vapid-public-key` | Clave pública VAPID para el navegador |
| POST | `/push/subscribe` | Registra la suscripción push de un dispositivo |

### Asistente IA
| Método | Ruta | Descripción |
|---|---|---|
| POST 🔒 | `/asistente` | Consulta a GPT-4o. Requiere `OPENAI_API_KEY` |

---

## 5. Modelos de datos

### Usuario (`usuario.model.ts`)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | String | Único, indexado |
| `nombre` | String | Email del usuario, único |
| `passwordHash` | String | — |
| `estado` | Enum | `pendiente` \| `activo` \| `suspendido` |
| `esAdmin` | Boolean | Acceso al panel de administración |
| `creadoEn` | String | ISO 8601 |
| `ultimoAcceso` | String | ISO 8601 |
| `pushSubs` | Array | Suscripciones Web Push (`endpoint`, `keys.p256dh`, `keys.auth`) |

### Cliente, Factura y Empresa (`cliente.model.ts`)

Los tres esquemas incluyen `usuarioId` como campo de aislamiento. `Cliente` agrupa además `fotos`, `movimientos` y `horas` como subdocumentos.

---

## 6. Convenciones del frontend

| Aspecto | Regla |
|---|---|
| Moneda | Formato europeo sin abreviar — `1.234,56 €` |
| Fechas | `dd/mm/yyyy` mediante `formatoFecha()` en `calculos.ts` |
| Entrada numérica | `ImporteInput` acepta coma y punto (los `input type="number"` nativos rechazan la coma) |
| Estilos | CSS Modules exclusivamente. Nada de CSS global |
| Navegación móvil | Barra inferior fija de 72 px, `z-index: 100` |
| Modales | Deben usar `z-index` 1001 o superior para quedar por encima de la barra inferior |
| Interfaz | Sin botones flotantes. Las acciones globales van en la cabecera |

### Hooks principales

| Hook | Responsabilidad |
|---|---|
| `use-auth.ts` | Sesión, token en `localStorage`, login y logout |
| `use-clientes.ts` | Carga diferida del conjunto de clientes tras autenticar |
| `use-facturas.ts` | Ingresos y gastos |
| `use-empresa.ts` | Datos fiscales por usuario |
| `use-licencia.ts` | Revalida el estado de la cuenta cada 120 s |
| `use-push.ts` | Registra el service worker y la suscripción push |
| `use-registro.ts` | Alta de nuevos usuarios |

---

## 7. Desplegar fuera de Bit

El proyecto está pensado para desplegarse como una unidad con `bit run presupuestos-platform`, pero puede separarse.

### Backend en Railway o Render

1. Extrae la carpeta `presupuestos/presupuestos-service`.
2. Sustituye los imports de paquetes Bit (`@madera-creativa/presupuestos.*`) por rutas relativas.
3. Crea un `package.json` con: `express`, `cors`, `mongoose`, `web-push`.
4. Comando de arranque: `node dist/presupuestos-service.app-root.js`.
5. Configura todas las variables de `.env.example` en el panel del proveedor.

### Frontend en Netlify o Vercel

1. Extrae la carpeta `presupuestos/presupuestos-prototype`.
2. Comando de build: `vite build`. Directorio de salida: `dist`.
3. Sustituye el proxy de `vite.config.js` por una variable `VITE_API_URL` que apunte a la URL pública del backend.
4. Ajusta `api.ts` para leer esa variable en lugar de la ruta relativa `/api`.
5. Añade una redirección SPA: todas las rutas a `/index.html`.

### Base de datos

MongoDB Atlas ya está en la nube. Solo hay que añadir las IP de los nuevos servidores a la lista blanca de red del clúster.

---

## 8. Puntos abiertos

| Tema | Estado |
|---|---|
| Notificaciones push en producción | Falta verificar entrega real en navegador móvil |
| `z-index` de modales en móvil | Los botones de formularios largos pueden quedar tapados por la barra inferior |
| Galería de fotos | Falta rematar la integración visual dentro de las pestañas de la ficha de cliente |
| Aviso de Mongoose | Los `findOneAndUpdate` usan `new: true`; conviene migrar a `returnDocument: 'after'` |

---

## 9. Historial de decisiones

- **OCR con Tesseract.js retirado** — provocaba un fallo de inicialización del bundle en producción (`n.join()`). Sustituido por un escáner propio multipágina con filtros de imagen (color, blanco y negro, realzado).
- **Sin renderizado en servidor** — la app depende de `localStorage`, Canvas 2D y Web Speech API, todas de cliente.
- **Credenciales por variables de entorno** — nunca escritas en el código.
- **Plataforma combinada** — frontend y backend se despliegan juntos para simplificar la operación.
