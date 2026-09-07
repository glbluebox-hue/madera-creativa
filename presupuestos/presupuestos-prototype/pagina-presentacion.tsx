import type { ReactNode } from 'react';
import logoMadera from './assets/logo.png';
import loginMadera from './assets/login-madera.jpg';
import { CATALOGO_PLANES } from './planes.js';
import { PaginaPlanes } from './pagina-planes.js';
import styles from './styles.module.css';

/**
 * Página de presentación comercial (05/09/2026) — nueva capa ANTERIOR al
 * login y al registro, nunca un sustituto de ninguno de los dos: el
 * objetivo es que un visitante nuevo entienda qué es Madera Creativa
 * Estudio, a quién ayuda y qué diferencia hay entre los planes ANTES de
 * llegar a un formulario. `login-page.tsx` sigue siendo el único sitio
 * donde existe autenticación/registro real — esta página solo decide con
 * qué pestaña abrirlo (`onEntrar` → "Entrar", `onEmpezar` → "Regístrate",
 * vía la prop `pantallaInicial` de `LoginPage`).
 *
 * Reutiliza `PaginaPlanes` tal cual (selector mensual/anual, las tres
 * tarjetas, acordeones, catálogo de `planes.ts`) — cero datos de precios
 * ni funciones duplicados aquí; el único contenido propio de esta página
 * es la propuesta de valor y el bloque de "oferta de lanzamiento"
 * alrededor de esas tarjetas.
 */

export type PaginaPresentacionProps = {
  /** "Ya tengo una cuenta → Entrar" (nav y hero) — abre `LoginPage` en la pestaña "Entrar". */
  onEntrar: () => void;
  /** "Empezar ahora" / "Empezar gratis" / "Empezar mis 60 días gratis" — abre `LoginPage` en la pestaña "Regístrate". */
  onEmpezar: () => void;
};

/**
 * ¿Debe saltarse esta página e ir directo a `LoginPage`? Sí cuando la URL
 * ya trae un enlace transaccional real (invitación, verificación de
 * email, recuperación de contraseña) — a quien llega por uno de esos
 * enlaces no le corresponde ver primero una página comercial, sino la
 * pantalla que ese enlace concreto espera mostrar. Función pura, testable
 * sin depender de `window.location` global.
 */
export function debeSaltarPresentacionComercial(params: URLSearchParams): boolean {
  return !!params.get('codigo') || !!params.get('verificar') || !!params.get('recuperar');
}

const ICONO_PROPS = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

type Funcion = { titulo: string; texto: string; icono: ReactNode };

/**
 * "Qué puedes hacer" (encargo §4) — únicamente funciones reales ya
 * implementadas en la app, comprobadas antes de escribir esta lista:
 * clientes/proyectos, presupuestos, mediciones (Tablero de mediciones y
 * dibujo, con cotas), facturas y gastos, rentabilidad (Centro de
 * Inteligencia de Precios, PRO), IA (copiloto de presupuesto, escáner de
 * facturas, investigación de mercado), y Portal del cliente
 * (aceptación/firma digital, PRO). Ninguna función inventada.
 */
const FUNCIONES: Funcion[] = [
  {
    titulo: 'Clientes y proyectos',
    texto: 'Ten toda la información de cada trabajo organizada, con su propio historial.',
    icono: <svg {...ICONO_PROPS}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
  },
  {
    titulo: 'Presupuestos',
    texto: 'Crea presupuestos profesionales y compártelos con tus clientes en un enlace.',
    icono: <svg {...ICONO_PROPS}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="13" y2="17" /></svg>,
  },
  {
    titulo: 'Mediciones',
    texto: 'Registra medidas, cotas y fotografías directamente desde el trabajo.',
    icono: <svg {...ICONO_PROPS}><path d="M21.3 8.7 15.3 2.7a1 1 0 0 0-1.4 0L2.7 13.9a1 1 0 0 0 0 1.4l6 6a1 1 0 0 0 1.4 0L21.3 10.1a1 1 0 0 0 0-1.4Z" /><path d="m7.5 10.5 2 2" /><path d="m10.5 7.5 2 2" /><path d="m13.5 4.5 2 2" /></svg>,
  },
  {
    titulo: 'Facturas y gastos',
    texto: 'Centraliza facturas, proveedores y gastos, con escáner incluido.',
    icono: <svg {...ICONO_PROPS}><path d="M4 2h13l3 3v17l-3-2-3 2-3-2-3 2-3-2-3 2V4a2 2 0 0 1 2-2Z" /><line x1="8" y1="7" x2="16" y2="7" /><line x1="8" y1="11" x2="16" y2="11" /></svg>,
  },
  {
    titulo: 'Rentabilidad',
    texto: 'Entiende cuánto ganas realmente en cada proyecto, no solo cuánto facturas.',
    icono: <svg {...ICONO_PROPS}><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></svg>,
  },
  {
    titulo: 'Inteligencia artificial',
    texto: 'Usa IA para leer facturas, investigar precios de mercado y ayudarte a decidir.',
    icono: <svg {...ICONO_PROPS}><path d="M12 2a4 4 0 0 0-4 4c0 1 .3 1.8.9 2.5A4 4 0 0 0 8 12v6a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-6a4 4 0 0 0-.9-3.5c.6-.7.9-1.5.9-2.5a4 4 0 0 0-4-4Z" /><line x1="9" y1="21" x2="15" y2="21" /></svg>,
  },
  {
    titulo: 'Portal del cliente',
    texto: 'Comparte el presupuesto y permite su aceptación y firma digital.',
    icono: <svg {...ICONO_PROPS}><path d="M18 8a3 3 0 1 0-2.83-4H15a3 3 0 0 0 .09 4.24L9 12" /><circle cx="6" cy="12" r="3" /><path d="M9 12a3 3 0 0 0 3 4.76" /><circle cx="18" cy="18" r="3" /></svg>,
  },
];

const CENTRALIZA = ['Clientes', 'Proyectos', 'Presupuestos', 'Mediciones', 'Facturas y gastos', 'Proveedores', 'Rentabilidad', 'Documentos', 'Herramientas de IA'];

function Boton({ children, variante, onClick, grande }: { children: ReactNode; variante: 'primario' | 'secundario'; onClick: () => void; grande?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${styles.btn} ${variante === 'primario' ? styles.btnPrimario : styles.btnSecundario}`}
      style={grande ? { fontSize: '0.95rem', padding: '0.8rem 1.6rem' } : undefined}
    >
      {children}
    </button>
  );
}

export function PaginaPresentacion({ onEntrar, onEmpezar }: PaginaPresentacionProps) {
  return (
    <div className={styles.app} style={{ minHeight: '100vh', overflowX: 'hidden' }}>

      {/* ── NAVEGACIÓN (encargo §11) — sencilla, sin menú desplegable: en móvil los enlaces centrales simplemente pasan a una segunda línea (flexWrap), nunca un menú hamburguesa nuevo. ── */}
      <header style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', padding: '1rem 1.5rem', borderBottom: '1px solid var(--borde)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800, fontSize: '0.95rem', letterSpacing: '-0.02em' }}>
          <img src={logoMadera} alt="" style={{ height: 28, width: 28, objectFit: 'contain' }} />
          Madera Creativa Estudio
        </div>
        <nav style={{ display: 'flex', gap: '1.1rem', flexWrap: 'wrap', marginLeft: '0.5rem', fontSize: '0.82rem' }}>
          <a href="#que-es" style={{ color: 'var(--topo-claro)', textDecoration: 'none' }}>¿Qué es?</a>
          <a href="#funciones" style={{ color: 'var(--topo-claro)', textDecoration: 'none' }}>Funciones</a>
          <a href="#planes" style={{ color: 'var(--topo-claro)', textDecoration: 'none' }}>Planes</a>
        </nav>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginLeft: 'auto', flexWrap: 'wrap' }}>
          <button type="button" onClick={onEntrar} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.82rem', color: 'var(--topo)', fontWeight: 600 }}>
            ¿Ya tienes cuenta? <span style={{ textDecoration: 'underline' }}>Entrar</span>
          </button>
          <Boton variante="primario" onClick={onEmpezar}>Empezar gratis</Boton>
        </div>
      </header>

      {/* ── HERO (encargo §1-2) ── */}
      <section style={{ display: 'flex', flexWrap: 'wrap', gap: '2.5rem', alignItems: 'center', padding: '3.5rem 1.5rem', maxWidth: 1180, margin: '0 auto' }}>
        <div style={{ flex: '1 1 420px', display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--verde)' }}>
            Software de gestión para carpintería
          </span>
          <h1 style={{ margin: 0, fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.15, color: 'var(--negro)' }}>
            Gestiona tu negocio de carpintería desde un solo lugar.
          </h1>
          <p style={{ margin: 0, fontSize: '1rem', lineHeight: 1.6, color: 'var(--topo-claro)', maxWidth: 520 }}>
            Clientes, proyectos, presupuestos, mediciones, facturas, rentabilidad e inteligencia artificial para ayudarte a trabajar mejor y tomar mejores decisiones.
          </p>
          <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', alignItems: 'center', marginTop: '0.4rem' }}>
            <Boton variante="primario" onClick={onEmpezar} grande>Empezar ahora</Boton>
            <button type="button" onClick={onEntrar} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.88rem', color: 'var(--topo)', fontWeight: 600 }}>
              Ya tengo una cuenta → <span style={{ textDecoration: 'underline' }}>Entrar</span>
            </button>
          </div>
        </div>
        <div style={{ flex: '1 1 320px', minWidth: 260 }}>
          <img
            src={loginMadera}
            alt=""
            style={{ width: '100%', height: 320, objectFit: 'cover', borderRadius: 'var(--radio-grande)', boxShadow: 'var(--sombra)', display: 'block' }}
          />
        </div>
      </section>

      {/* ── QUÉ PROBLEMA RESUELVE (encargo §3) ── */}
      <section id="que-es" style={{ padding: '3rem 1.5rem', background: 'var(--fondo-caja)' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h2 className={styles.h2} style={{ fontSize: '1.6rem' }}>Menos tiempo buscando información. Más tiempo trabajando.</h2>
          <p style={{ margin: 0, fontSize: '0.92rem', lineHeight: 1.7, color: 'var(--topo-claro)' }}>
            Cada presupuesto, cada medida tomada en obra, cada factura de un proveedor y cada foto de un trabajo terminado
            hoy viven repartidos entre el móvil, el email y algún cuaderno. Madera Creativa Estudio los reúne todos en un
            solo sitio, pensado para cómo trabaja de verdad un carpintero, no como un programa de contabilidad genérico.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center', marginTop: '0.5rem' }}>
            {CENTRALIZA.map((c) => (
              <span key={c} style={{ fontSize: '0.76rem', fontWeight: 600, padding: '0.35em 0.85em', borderRadius: 999, background: 'var(--fondo-panel)', border: '1px solid var(--borde)', color: 'var(--topo)' }}>
                {c}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── QUÉ PUEDES HACER (encargo §4) ── */}
      <section id="funciones" style={{ padding: '3.5rem 1.5rem', maxWidth: 1180, margin: '0 auto' }}>
        <h2 className={styles.h2} style={{ fontSize: '1.6rem', textAlign: 'center', marginBottom: '2rem' }}>Todo lo que necesitas, en un solo sitio.</h2>
        <div style={{ display: 'grid', gap: '1.1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}>
          {FUNCIONES.map((f) => (
            <div key={f.titulo} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', padding: '1.2rem', borderRadius: 'var(--radio-grande)', border: '1px solid var(--borde)', background: 'var(--fondo-panel)' }}>
              <span style={{ color: 'var(--topo)' }}>{f.icono}</span>
              <strong style={{ fontSize: '0.9rem' }}>{f.titulo}</strong>
              <span style={{ fontSize: '0.8rem', lineHeight: 1.5, color: 'var(--topo-claro)' }}>{f.texto}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── OFERTA DE LANZAMIENTO + PLANES (encargo §5-7) ── */}
      <section id="planes" style={{ padding: '3.5rem 1.5rem', background: 'var(--fondo-caja)' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>

          {/* Oferta de lanzamiento — nunca afirma una fecha de fin concreta (no existe ninguna definida). */}
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '0.6rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--verde)', background: 'var(--verde-bg)', padding: '0.3em 0.9em', borderRadius: 999 }}>
              Experiencia de lanzamiento
            </span>
            <h2 style={{ margin: 0, fontSize: 'clamp(1.6rem, 3.5vw, 2.2rem)', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--negro)' }}>
              60 días gratis
            </h2>
            <span style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ocre)' }}>
              Por tiempo limitado
            </span>
            <p style={{ margin: '0.4rem 0 0', maxWidth: 560, fontSize: '0.88rem', lineHeight: 1.6, color: 'var(--topo-claro)' }}>
              Durante 60 días puedes probar gratuitamente las funcionalidades de {CATALOGO_PLANES[0].nombre} + {CATALOGO_PLANES[1].nombre}.
              Sin tarjeta y sin compromiso. {CATALOGO_PLANES[2].nombre} no está incluido en la prueba — disponible como plan de pago normal.
            </p>
          </div>

          <p style={{ margin: 0, textAlign: 'center', fontSize: '0.85rem', color: 'var(--topo-claro)' }}>
            Elige el plan que mejor se adapta a tu negocio — podrás cambiarlo más adelante.
          </p>

          {/* Reutiliza tal cual: selector mensual/anual + las tres tarjetas + catálogo de planes.ts. Cero precios/lógica duplicados aquí. */}
          <PaginaPlanes />

          <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
            <Boton variante="primario" onClick={onEmpezar} grande>Empezar mis 60 días gratis</Boton>
          </div>
        </div>
      </section>

      {/* ── PIE ── */}
      <footer style={{ padding: '2rem 1.5rem', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--topo-claro)' }}>
          © {new Date().getFullYear()} Madera Creativa · ¿Ya tienes cuenta?{' '}
          <button type="button" onClick={onEntrar} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, font: 'inherit', color: 'var(--topo)', fontWeight: 700, textDecoration: 'underline' }}>
            Entrar
          </button>
        </p>
      </footer>
    </div>
  );
}
