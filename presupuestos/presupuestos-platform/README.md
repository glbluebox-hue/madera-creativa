# Madera Creativa — Gestión de Presupuestos

Aplicación SaaS de gestión de clientes, presupuestos, facturas y contabilidad para carpintería.

- **Frontend**: React 18 + Vite (PWA instalable, móvil primero)
- **Backend**: Express + Mongoose (MongoDB Atlas)
- **Plataforma**: Bit Platform — compone frontend + backend + gateway en una sola unidad desplegable

---

## Descargar el proyecto completo

El código fuente vive en GitHub (repositorio privado). El histórico de versiones interno de cada componente Bit (`.bit/objects`) no tiene todavía un Scope remoto configurado — por eso viaja versionado dentro del propio repositorio de Git, no por separado en Bit Cloud.

### Instalación limpia — paso a paso

```bash
# 1. Clonar el repositorio
git clone https://github.com/glbluebox-hue/madera-creativa.git
cd madera-creativa

# 2. Instalar dependencias
bit install
```

**Importante**: el paso 2 es `bit install`, no `pnpm install`. Mientras el workspace dependa de paquetes con scope `@teambit`/`@bitdev` (resueltos por el propio registro de Bit), un `pnpm install` suelto falla con un 404 en el registro público de npm — verificado directamente clonando en una carpeta limpia. `bit install` resuelve el registro correcto internamente y de paso compila los componentes.

```bash
# 3. Configurar el archivo .env
cp presupuestos/presupuestos-platform/env.example presupuestos/presupuestos-platform/.env
# rellenar los valores reales (ver tabla más abajo)

# 4. Compilar o arrancar
bit compile
bit run presupuestos-platform
```

---

## Arranque en local

```bash
bit run presupuestos-platform
```

Esto levanta:

| Servicio | Puerto | Descripción |
|---|---|---|
| Frontend (Vite) | 3000–3100 | App web React |
| Gateway | 5000 | Enruta `/api/{servicio}/...` |
| `presupuestos-service` | 5001 | API REST Express |

Abre `http://localhost:3000`.

Para ver los puertos reales asignados: `bit app list`.

---

## Variables de entorno

Copia `.env.example` a `.env` y rellena los valores:

```bash
cp .env.example .env
```

| Variable | Obligatoria | Descripción |
|---|---|---|
| `MONGO_URL` | Sí | Cadena de conexión a MongoDB Atlas |
| `APP_USER` | Sí | Usuario administrador inicial |
| `APP_PASSWORD` | Sí | Contraseña del administrador inicial |
| `VAPID_PUBLIC_KEY` | No | Clave pública Web Push |
| `VAPID_PRIVATE_KEY` | No | Clave privada Web Push |
| `OPENAI_API_KEY` | No | Habilita el asistente IA (GPT-4o) |
| `PORT` | No | Puerto del servicio backend |

Genera claves VAPID nuevas con:

```bash
npx web-push generate-vapid-keys
```

---

## Estructura del proyecto

```
presupuestos/
├── presupuestos-platform/     # Composición desplegable (frontend + gateway + servicio)
├── presupuestos-prototype/    # App web React (PWA)
│   ├── assets/                # Logo, iconos PWA, service worker
│   ├── *.tsx                  # Vistas y componentes
│   ├── use-*.ts               # Hooks de datos y sesión
│   ├── calculos.ts            # Formato europeo, márgenes, IVA/IRPF
│   └── vite.config.js         # Proxy /api → gateway
└── presupuestos-service/      # API REST Express
    ├── presupuestos-service.app-root.ts   # Rutas HTTP
    ├── presupuestos-service.ts            # Lógica de datos (aislada por usuarioId)
    ├── cliente.model.ts                   # Esquemas Cliente / Factura / Empresa
    ├── usuario.model.ts                   # Esquema Usuario + licencias
    └── push.service.ts                    # Notificaciones Web Push
```

---

## Funcionalidades

- **Clientes y proyectos** — fichas con carpetas por año, presupuestos aceptados/rechazados, notas, adjuntos y galería de fotos
- **Márgenes de beneficio** — cálculo detallado por proyecto (materiales, horas, movimientos)
- **Facturas** — ingresos y gastos, edición en línea, escáner multipágina con filtros de imagen
- **Pizarra de medidas** — lienzo de alta resolución con acotado automático en mm/cm y multihoja por cliente
- **Contabilidad trimestral** — desglose Q1–Q4 con base imponible, gastos, IVA (21 %) e IRPF estimado
- **Licencias multiusuario** — registro por email, estados `pendiente` / `activo` / `suspendido` y panel de administración
- **Notificaciones push** — aviso al administrador en cada alta y al usuario al aprobarse su cuenta
- **PWA** — instalable en móvil, navegación inferior de 72 px, funciona con assets offline
- **Aislamiento de datos** — todo se filtra por `usuarioId`; cada cuenta arranca vacía

---

## Convenciones

- **Moneda**: formato europeo sin abreviar — `1.234,56 €`
- **Fechas**: `dd/mm/yyyy` mediante `formatoFecha()` en `calculos.ts`
- **Entrada numérica**: `ImporteInput` acepta coma y punto como separador decimal
- **Estilos**: CSS Modules (`styles.module.css`) — nunca CSS global

---

## Comandos útiles

```bash
bit list              # Listar componentes del proyecto
bit app list          # Ver apps y puertos
bit compile           # Compilar
bit check-types       # Comprobar tipos
bit validate          # Tipos + lint + tests
bit status            # Cambios pendientes
bit tag -m "mensaje"  # Versionar
bit export            # Publicar en Bit Cloud
```

> El control de versiones del código es Git/GitHub. Bit gestiona además su propio historial interno por componente (`.bit/objects`, sin Scope remoto configurado todavía) — de ahí que estos comandos convivan con los de Git.

---

## Documentación adicional

- [`MIGRACION.md`](./MIGRACION.md) — arquitectura, API, modelos de datos y cómo desplegar fuera de Bit
