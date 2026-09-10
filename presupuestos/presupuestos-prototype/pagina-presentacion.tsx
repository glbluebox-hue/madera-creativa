import { useState, useEffect } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import logoMadera from './assets/logo.png';
import loginMadera from './assets/hero-login-preview.jpg';
import { PaginaPlanes } from './pagina-planes.js';
import { useInstalarApp } from './use-instalar-app.js';

/**
 * Página de presentación comercial (05/09/2026, rediseño completo
 * 08/09/2026) — capa ANTERIOR al login y al registro, nunca un sustituto
 * de ninguno de los dos: `login-page.tsx` sigue siendo el único sitio con
 * autenticación/registro real, esta página solo decide con qué pestaña
 * abrirlo (`onEntrar` → "Entrar", `onEmpezar` → "Regístrate").
 *
 * El rediseño porta al código real el diseño aprobado en varias rondas
 * sobre una maqueta estática (artefacto de revisión visual) — colores,
 * estructura narrativa, mockups, textos y los dos temas (claro/oscuro),
 * exactos, ya iterados y aprobados ahí. Única diferencia deliberada: se
 * usa el logo real de la app (`assets/logo.png`), nunca el que se probó
 * solo en la maqueta — el mismo tratamiento de recolorearlo según el
 * tema (ver `useVariantesLogo`/`LogoMarca` más abajo) se aplica igual
 * sobre este logo real.
 *
 * Paleta propia de esta página (no la del resto de la app: `--topo` aquí
 * es #51463b, ligeramente distinto del #51483f global) — declarada como
 * variables CSS en el nodo raíz para no pisar los tokens del resto de la
 * app cuando esta página se desmonte. El tema (claro/oscuro) es un
 * estado local propio de esta página, independiente del tema del resto
 * de la app (`use-tema.ts`) — no hay sesión todavía en este punto, así
 * que no hay ningún tema de usuario que leer; empieza siempre en claro,
 * igual que la maqueta.
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
 *
 * `?entrar=1` (08/09/2026, reporte real): tras verificar el email o
 * restablecer la contraseña, `login-page.tsx` recarga a esta misma marca
 * en vez de a la ruta pelada — sin ella, al perderse `?verificar=`/
 * `?recuperar=` de la URL en la recarga, esta función dejaba de ver
 * ningún parámetro transaccional y volvía a mostrar la presentación
 * comercial en vez de llevar directo a "Entrar".
 */
export function debeSaltarPresentacionComercial(params: URLSearchParams): boolean {
  return !!params.get('codigo') || !!params.get('verificar') || !!params.get('recuperar') || !!params.get('entrar');
}

/** Paleta propia de esta página — ver comentario de arriba. Cast a CSSProperties: las variables CSS no están tipadas de forma nativa en React. */
const PALETA: CSSProperties = {
  ['--topo' as any]: '#51463b',
  ['--topo-claro' as any]: '#776a5c',
  ['--topo-muy-claro' as any]: '#b8b0a5',
  ['--marca-oscura' as any]: '#55483f',
  ['--fondo' as any]: '#f9f4ee',
  ['--fondo-panel' as any]: '#ffffff',
  ['--fondo-caja' as any]: '#eae5db',
  ['--borde' as any]: '#ded5c6',
  ['--borde-fino' as any]: '#ece5d8',
  ['--negro' as any]: '#18140f',
  ['--blanco' as any]: '#ffffff',
  ['--verde' as any]: '#3d7a52',
  ['--verde-bg' as any]: '#eaf3ee',
  ['--rojo' as any]: '#9b4535',
  ['--ocre' as any]: '#8a6835',
  ['--ocre-bg' as any]: '#f5ede0',
  ['--ocre-claro' as any]: '#e0ac5c',
  ['--sombra-xs' as any]: '0 1px 2px rgba(24,20,15,0.04)',
  ['--sombra' as any]: '0 4px 24px rgba(24,20,15,0.08), 0 1px 4px rgba(24,20,15,0.04)',
  ['--sombra-lg' as any]: '0 12px 48px rgba(24,20,15,0.14), 0 2px 8px rgba(24,20,15,0.06)',
  ['--radio' as any]: '6px',
  ['--radio-md' as any]: '10px',
  ['--radio-grande' as any]: '14px',
  ['--radio-xl' as any]: '20px',
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  color: 'var(--negro)',
  background: 'var(--fondo)',
  minHeight: '100vh',
  // Sin overflowX aquí a propósito (corrección 08/09/2026): cualquier
  // overflow distinto de "visible" en un ANCESTRO rompe `position:
  // sticky` en sus descendientes (aquí, la cabecera) — por eso la
  // cabecera no se quedaba fija al hacer scroll. El único elemento que
  // de verdad necesitaba recortar su desbordamiento (el fondo decorativo
  // del hero) ya tiene su propio overflow:hidden local, así que quitarlo
  // de aquí no reintroduce scroll horizontal.
};

/**
 * Overrides de modo oscuro ("Estudio Nocturno" de esta página, propio,
 * igual que la maqueta) — solo los tokens que de verdad cambian; el
 * resto (--topo, --ocre, --marca-oscura, --ocre-claro, --verde...) se
 * queda igual en los dos temas a propósito (mismo criterio que las
 * bandas oscuras fijas de la propia maqueta).
 */
const PALETA_OSCURA: CSSProperties = {
  ['--topo-muy-claro' as any]: '#9c9184',
  ['--fondo' as any]: '#241a10',
  ['--fondo-panel' as any]: '#2c2015',
  ['--fondo-caja' as any]: '#201709',
  ['--borde' as any]: '#4a3c28',
  ['--borde-fino' as any]: '#3a2e1d',
  ['--negro' as any]: '#f0e2c9',
  ['--blanco' as any]: '#f0e2c9',
  ['--verde-bg' as any]: '#1c2c22',
  ['--ocre-bg' as any]: '#2c2416',
  ['--sombra-xs' as any]: '0 1px 2px rgba(0,0,0,0.35)',
  ['--sombra' as any]: '0 4px 24px rgba(0,0,0,0.45), 0 1px 4px rgba(0,0,0,0.25)',
  ['--sombra-lg' as any]: '0 12px 48px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.3)',
};

const V = (nombre: string) => `var(${nombre})`;

/**
 * Recolorea el logo real según el tema — el marrón real de la marca en
 * modo claro, una variante clara del mismo marrón en modo oscuro (nunca
 * gris ni blanco, para que se siga leyendo como la misma marca).
 *
 * Corrección (08/09/2026, mismo día): el primer intento reproducía el
 * tratamiento verificado sobre la maqueta (una máscara de opacidad
 * calculada a partir del BRILLO de cada píxel) — válido ahí porque ese
 * PNG tenía fondo blanco SÓLIDO, sin transparencia propia. El logo real
 * de la app (`assets/logo.png`) es justo lo contrario: ya es un PNG con
 * canal alfa real (confirmado: colorType RGBA). En un PNG así, el color
 * RGB de los píxeles totalmente transparentes no está definido de forma
 * fiable (puede ser negro u otra basura, nunca pensado para verse) —
 * calcular el brillo ahí y tratarlo como "trazo oscuro" pintaba un
 * bloque sólido feo por toda la caja de la imagen. La corrección usa
 * directamente el canal alfa YA REAL del propio PNG (nunca lo
 * recalcula): cada píxel conserva su transparencia original, solo se le
 * cambia el color.
 */
const MARCA_OSCURA_RGB: [number, number, number] = [0x51, 0x46, 0x3b];
const MARCA_CLARA_RGB: [number, number, number] = [0xb8, 0xb0, 0xa5];

function useVariantesLogo(src: string): { claro: string; oscuro: string } | null {
  const [variantes, setVariantes] = useState<{ claro: string; oscuro: string } | null>(null);
  useEffect(() => {
    let cancelado = false;
    const img = new Image();
    img.onload = () => {
      if (cancelado) return;
      try {
        const lienzo = document.createElement('canvas');
        lienzo.width = img.naturalWidth;
        lienzo.height = img.naturalHeight;
        const ctx = lienzo.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const original = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
        const total = lienzo.width * lienzo.height;
        const pintarVariante = ([r, g, b]: [number, number, number]) => {
          const salida = ctx.createImageData(lienzo.width, lienzo.height);
          for (let i = 0; i < total * 4; i += 4) {
            salida.data[i] = r; salida.data[i + 1] = g; salida.data[i + 2] = b;
            salida.data[i + 3] = original.data[i + 3]; // el alfa real del PNG, sin tocar
          }
          ctx.putImageData(salida, 0, 0);
          return lienzo.toDataURL('image/png');
        };
        setVariantes({ claro: pintarVariante(MARCA_OSCURA_RGB), oscuro: pintarVariante(MARCA_CLARA_RGB) });
      } catch {
        // Si algo falla (navegador muy antiguo, etc.), se queda con el logo original sin recolorear.
      }
    };
    img.src = src;
    return () => { cancelado = true; };
  }, [src]);
  return variantes;
}

/** Logo de marca ya recoloreado según el tema — mientras se procesa (o si falla), muestra el PNG original tal cual. */
function LogoMarca({ tema, alto, alt }: { tema: 'light' | 'dark'; alto: number; alt: string }) {
  const variantes = useVariantesLogo(logoMadera);
  const src = variantes ? (tema === 'dark' ? variantes.oscuro : variantes.claro) : logoMadera;
  return <img src={src} alt={alt} style={{ height: alto, width: 'auto', display: 'block' }} />;
}

function IconoTema({ s = 15 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function Boton({ children, variante, onClick, grande, href }: { children: ReactNode; variante: 'primario' | 'secundario'; onClick?: () => void; grande?: boolean; href?: string }) {
  const estilo: CSSProperties = {
    border: '1px solid transparent', borderRadius: V('--radio'), padding: grande ? '0.95rem 1.9rem' : '0.65rem 1.3rem',
    fontSize: grande ? '1rem' : '0.86rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '-0.01em',
    display: 'inline-flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none', whiteSpace: 'nowrap',
    background: variante === 'primario' ? V('--topo') : V('--fondo-panel'),
    color: variante === 'primario' ? V('--blanco') : V('--topo'),
    borderColor: variante === 'primario' ? 'transparent' : V('--borde'),
    boxShadow: variante === 'primario' ? V('--sombra-xs') : undefined,
  };
  if (href) return <a href={href} style={estilo}>{children}</a>;
  return <button type="button" onClick={onClick} style={estilo}>{children}</button>;
}

function EnlaceSuave({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', color: V('--topo'), fontWeight: 600, padding: 0 }}>
      {children}
    </button>
  );
}

function Check({ s = 12 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/* ── Ola: curva orgánica entre dos franjas de color (nunca un corte recto) ── */
const OLA_A = 'M0,30 C120,54 240,54 360,30 S600,6 720,30 S960,54 1080,30 S1320,6 1440,30 L1440,60 L0,60 Z';
const OLA_B = 'M0,30 C120,6 240,6 360,30 S600,54 720,30 S960,6 1080,30 S1320,54 1440,30 L1440,60 L0,60 Z';

function Ola({ fondo, siguiente, variante }: { fondo: string; siguiente: string; variante: 'a' | 'b' }) {
  return (
    <div aria-hidden="true" style={{ width: '100%', overflow: 'hidden', lineHeight: 0, background: fondo }}>
      <svg viewBox="0 0 1440 60" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: 'clamp(26px, 5vw, 46px)' }}>
        <path d={variante === 'a' ? OLA_A : OLA_B} style={{ fill: siguiente, filter: 'drop-shadow(0 2px 2px rgba(24,20,15,0.12))' }} />
      </svg>
    </div>
  );
}

export function PaginaPresentacion({ onEntrar, onEmpezar }: PaginaPresentacionProps) {
  const [informeGenerado, setInformeGenerado] = useState(false);
  const [tema, setTema] = useState<'light' | 'dark'>('light');
  const { disponible: instalacionDisponible, instalada, instalar } = useInstalarApp();
  const paletaActiva: CSSProperties = tema === 'dark' ? { ...PALETA, ...PALETA_OSCURA } : PALETA;

  return (
    <div style={paletaActiva}>

      {/* ── NAV ── */}
      <header style={{
        display: 'flex', alignItems: 'center', gap: '1.2rem', flexWrap: 'wrap', padding: '0.9rem 1.5rem',
        borderBottom: `1px solid ${V('--borde')}`, position: 'sticky', top: 0, background: 'color-mix(in srgb, var(--fondo) 92%, transparent)',
        backdropFilter: 'blur(8px)', zIndex: 30, isolation: 'isolate',
      }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <LogoMarca tema={tema} alto={56} alt="Madera Creativa Estudio" />
        </div>
        <nav style={{ display: 'flex', gap: '1.3rem', flexWrap: 'wrap', marginLeft: '0.8rem', fontSize: '0.83rem' }}>
          <a href="#idea" style={{ color: V('--topo-claro'), textDecoration: 'none' }}>Cómo funciona</a>
          <a href="#fiscal" style={{ color: V('--topo-claro'), textDecoration: 'none' }}>Fiscal</a>
          <a href="#ia" style={{ color: V('--topo-claro'), textDecoration: 'none' }}>IA</a>
          <a href="#planes" style={{ color: V('--topo-claro'), textDecoration: 'none' }}>Planes</a>
        </nav>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginLeft: 'auto', flexWrap: 'wrap' }}>
          {/* Mismo botón real de instalación que la sección de más abajo (ver useInstalarApp) — aquí en la cabecera, siempre a mano mientras se navega la página, en vez de solo al llegar a esa sección. */}
          {instalacionDisponible && (
            <button
              type="button"
              onClick={instalar}
              title="Instalar aplicación"
              style={{ background: V('--ocre'), border: 'none', borderRadius: V('--radio'), padding: '0.5rem 0.9rem', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', color: V('--blanco'), display: 'inline-flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}
            >
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
              Instalar en tu dispositivo
            </button>
          )}
          <button
            type="button"
            onClick={() => setTema((t) => (t === 'dark' ? 'light' : 'dark'))}
            title="Modo oscuro / claro"
            aria-label="Cambiar tema"
            style={{ background: 'none', border: `1px solid ${V('--borde')}`, borderRadius: 999, width: 34, height: 34, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: V('--topo'), flexShrink: 0 }}
          >
            <IconoTema />
          </button>
          <EnlaceSuave onClick={onEntrar}>¿Ya tienes cuenta? <u>Entrar</u></EnlaceSuave>
          <Boton variante="primario" onClick={onEmpezar}>Empezar gratis</Boton>
        </div>
      </header>

      {/* ── HERO ── */}
      <section style={{ position: 'relative', padding: '4.5rem 1.5rem 3.5rem', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 900px 500px at 85% -10%, var(--ocre-bg), transparent 60%)', zIndex: 0 }} />
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexWrap: 'wrap', gap: '3rem', alignItems: 'center', maxWidth: 1180, margin: '0 auto' }}>
          <div style={{ flex: '1 1 460px', display: 'flex', flexDirection: 'column', gap: '1.3rem' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: V('--ocre') }}>
              Hecho por carpinteros, para carpinteros
            </span>
            <h1 style={{ margin: 0, fontSize: 'clamp(2rem, 4.2vw, 3.1rem)', fontWeight: 900, letterSpacing: '-0.035em', lineHeight: 1.08, color: V('--negro') }}>
              Toda tu carpintería, <span style={{ color: V('--ocre') }}>conectada</span> en un solo lugar.
            </h1>
            <p style={{ margin: 0, fontSize: '1.05rem', lineHeight: 1.65, color: V('--topo-claro'), maxWidth: 540 }}>
              Del primer contacto con un cliente hasta el informe que le entregas a tu asesor cada trimestre: un único hilo que conecta obra, presupuesto, gastos, rentabilidad y fiscalidad — sin repetir el mismo dato tres veces.
            </p>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', marginTop: '0.3rem' }}>
              <Boton variante="primario" onClick={onEmpezar} grande>Probar Madera Creativa Estudio</Boton>
              <EnlaceSuave onClick={onEntrar}>¿Ya tienes cuenta? <u>Entrar</u></EnlaceSuave>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.3rem' }}>
              {['60 días gratis', 'Sin tarjeta', 'Basic + Pro incluidos'].map((texto) => (
                <span key={texto} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.74rem', fontWeight: 700, color: V('--verde'), background: V('--verde-bg'), borderRadius: 999, padding: '0.35em 0.85em' }}>
                  <Check /> {texto}
                </span>
              ))}
            </div>
          </div>
          <div style={{ flex: '1 1 380px', minWidth: 280, position: 'relative' }}>
            {/* Vista previa de la pantalla de entrada real (recapturada 10/09/2026,
                a petición del usuario: antes iba muy ampliada y solo se veía la
                madera con un trozo del formulario. Ahora se muestra entera —
                la losa de madera con su corteza Y el formulario completo
                (Entrar / Regístrate / Usuario / Contraseña) — sin recortar,
                con la relación de aspecto natural de la captura (1100×620). */}
            <img src={loginMadera} alt="Pantalla de entrada de Madera Creativa Estudio" style={{ width: '100%', height: 'auto', aspectRatio: '1100 / 620', objectFit: 'cover', borderRadius: V('--radio-xl'), boxShadow: V('--sombra-lg'), display: 'block' }} />
            <div style={{ position: 'absolute', bottom: -22, left: -22, background: V('--fondo-panel'), border: `1px solid ${V('--borde')}`, borderRadius: V('--radio-md'), boxShadow: V('--sombra'), padding: '0.8rem 1.1rem', display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.78rem', fontWeight: 700 }}>
              <span style={{ color: V('--verde'), flexShrink: 0 }}>
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></svg>
              </span>
              Sabrás cuánto ganas en cada obra
            </div>
          </div>
        </div>
      </section>

      <Ola fondo={V('--fondo')} siguiente={V('--fondo-caja')} variante="b" />

      {/* ── IDEA CENTRAL ── */}
      <section id="idea" style={{ padding: '3.5rem 1.5rem 3rem', textAlign: 'center', background: V('--fondo-caja') }}>
        <span style={{ display: 'block', marginBottom: '0.6rem', fontSize: '0.74rem', fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: V('--ocre') }}>La idea central</span>
        <h2 style={{ margin: '0 auto', maxWidth: 760, fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.25 }}>Todo tu negocio, en un solo sitio.</h2>
        <p style={{ maxWidth: 620, margin: '1rem auto 0', color: V('--topo-claro'), fontSize: '0.95rem', lineHeight: 1.6 }}>
          Cliente → Presupuesto → Factura → Rentabilidad → Fiscalidad. Todo conectado — nunca escribes el mismo dato dos veces.
        </p>
      </section>

      <Ola fondo={V('--fondo-caja')} siguiente={V('--fondo')} variante="a" />

      {/* ── ESPINA NARRATIVA (6 pasos) ── */}
      <section style={{ padding: '2.5rem 1.5rem 1rem', maxWidth: 900, margin: '0 auto', position: 'relative' }}>
        <div style={{ position: 'relative', paddingLeft: '3.2rem' }}>
          <div aria-hidden="true" style={{ position: 'absolute', left: 17, top: 10, bottom: 10, width: 2, background: 'repeating-linear-gradient(to bottom, var(--topo-muy-claro) 0 6px, transparent 6px 12px)' }} />

          {/* 1 */}
          <Paso num={1}>
            <p style={E.pasoFrase}>Entra un cliente.</p>
            <p style={E.pasoDetalle}>Guardas sus datos una vez. Ya los tienes siempre a mano.</p>
          </Paso>

          {/* 2 */}
          <Paso num={2}>
            <p style={E.pasoFrase}>Creas su proyecto.</p>
            <p style={E.pasoDetalle}>Cada obra tiene su propia carpeta, con todo dentro.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.2rem' }}>
              {['Mediciones', 'Fotos y cotas', 'Modelo 3D', 'Documentos'].map((c) => (
                <span key={c} style={E.chip}>{c}</span>
              ))}
            </div>
          </Paso>

          {/* 3 */}
          <Paso num={3}>
            <p style={E.pasoFrase}>Lo mides.</p>
            <p style={E.pasoDetalle}>Apuntas las medidas desde el móvil, en la propia obra.</p>
          </Paso>

          {/* 4 — mockups presupuesto + portal */}
          <Paso num={4}>
            <p style={E.pasoFrase}>Preparas el presupuesto — y el cliente hace el resto.</p>
            <p style={E.pasoDetalle}>Se lo envías por un enlace. Él lo acepta y lo firma desde su móvil.</p>
            <div style={{ display: 'flex', gap: '1.8rem', flexWrap: 'wrap', alignItems: 'flex-start', marginTop: '1.2rem' }}>
              <div style={{ flex: '1 1 280px', maxWidth: 320, background: V('--fondo-panel'), border: `1px solid ${V('--borde')}`, borderRadius: V('--radio-grande'), boxShadow: V('--sombra'), padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: `1px solid ${V('--borde-fino')}`, paddingBottom: '0.6rem' }}>
                  <strong style={{ fontSize: '0.9rem' }}>Presupuesto #0142</strong><span style={{ fontSize: '0.7rem', color: V('--topo-claro') }}>Reforma cocina</span>
                </div>
                <Partida label="Muebles altos y bajos" valor="2.450 €" />
                <Partida label="Encimera roble macizo" valor="890 €" />
                <Partida label="Montaje e instalación" valor="560 €" />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', fontWeight: 800, borderTop: `1px solid ${V('--borde-fino')}`, paddingTop: '0.6rem' }}>
                  <span>Total</span><span>3.900 €</span>
                </div>
                <div style={{ marginTop: '0.3rem', textAlign: 'center', fontSize: '0.76rem', fontWeight: 700, padding: '0.5em', borderRadius: V('--radio'), background: V('--topo'), color: V('--blanco') }}>Compartir con cliente →</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem', color: V('--topo-muy-claro'), fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0, alignSelf: 'center' }}>
                <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                Enlace
              </div>
              <div style={{ flex: '1 1 280px', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: V('--topo-claro'), display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><rect x="5" y="2" width="14" height="20" rx="2" /><line x1="12" y1="18" x2="12.01" y2="18" /></svg>
                  Así lo ve tu cliente en el móvil
                </div>
                <div style={{ background: V('--blanco'), border: `1px solid ${V('--borde')}`, borderRadius: V('--radio-md'), boxShadow: V('--sombra-lg'), padding: '1.2rem 1.2rem 1.4rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: '0.7rem', borderBottom: `1px solid ${V('--borde-fino')}` }}>
                    <LogoMarca tema={tema} alto={32} alt="Madera Creativa Estudio" />
                  </div>
                  <div style={{ fontSize: '0.8rem', color: V('--topo-claro'), display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
                    Presupuesto para <span style={E.redactado(96)} />
                  </div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: V('--negro') }}>Reforma cocina — Presupuesto #0142</div>
                  <Partida label="Muebles altos y bajos" valor="2.450 €" />
                  <Partida label="Encimera roble macizo" valor="890 €" />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', fontWeight: 800, borderTop: `1px solid ${V('--borde-fino')}`, paddingTop: '0.6rem' }}>
                    <span>Total</span><span>3.900 €</span>
                  </div>
                  <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.6rem', paddingTop: '0.6rem', borderTop: `1px dashed ${V('--borde')}` }}>
                    <div style={{ fontSize: '0.7rem', color: V('--topo-claro'), textAlign: 'center', fontStyle: 'italic', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
                      Firma de <span style={E.redactado(70)} />
                    </div>
                    <div style={{ textAlign: 'center', fontSize: '0.8rem', fontWeight: 800, padding: '0.65em', borderRadius: 8, background: V('--ocre'), color: V('--blanco') }}>✓ Aceptar y firmar</div>
                  </div>
                </div>
              </div>
            </div>
          </Paso>

          {/* 5 */}
          <Paso num={5}>
            <p style={E.pasoFrase}>Registras los gastos y facturas.</p>
            <p style={E.pasoDetalle}>Subes la factura y queda unida a esa obra. Sabes lo que te ha costado de verdad.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem', marginTop: '1rem' }}>
              {['Factura de proveedor', 'Gasto', 'Proyecto', 'Coste real'].map((nodo, i) => (
                <span key={nodo} style={{ display: 'contents' }}>
                  <span style={E.cadenaNodo}>{nodo}</span>
                  {i < 3 && <span style={{ color: V('--topo-muy-claro'), fontWeight: 700 }}>→</span>}
                </span>
              ))}
            </div>
          </Paso>

          {/* 6 */}
          <Paso num={6} ultimo>
            <p style={E.pasoFrase}>Conoces el margen.</p>
            <p style={E.pasoDetalle}>No solo cuánto has cobrado — cuánto has ganado de verdad.</p>
            <div style={{ marginTop: '1.1rem', background: V('--fondo-panel'), border: `1px solid ${V('--borde')}`, borderRadius: V('--radio-grande'), padding: '1.2rem 1.4rem', boxShadow: V('--sombra-xs'), display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.85rem', fontWeight: 700, flexWrap: 'wrap' }}>
                <span>Ingresos</span><span style={{ color: V('--topo-muy-claro'), fontWeight: 400 }}>+</span>
                <span>Gastos</span><span style={{ color: V('--topo-muy-claro'), fontWeight: 400 }}>+</span>
                <span>Costes</span><span style={{ color: V('--topo-muy-claro'), fontWeight: 400 }}>=</span>
                <span>Margen real</span>
              </div>
              <span style={{ fontSize: '0.82rem', fontWeight: 800, color: V('--verde') }}>Margen de esta obra: 28,4%</span>
            </div>
          </Paso>
        </div>
      </section>

      <Ola fondo={V('--fondo')} siguiente={V('--fondo-caja')} variante="b" />

      {/* ── FISCAL ── */}
      <section id="fiscal" style={{ padding: '4rem 1.5rem', background: V('--fondo-caja') }}>
        <div style={{ maxWidth: 980, margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: '2.5rem', alignItems: 'center' }}>
          <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: V('--ocre') }}>Llega el trimestre</span>
            <h2 style={{ margin: 0, fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: 800, letterSpacing: '-0.03em' }}>Ya no revisas facturas a última hora.</h2>
            <p style={{ margin: 0, fontSize: '0.92rem', lineHeight: 1.6, color: V('--topo-claro') }}>
              Cada factura queda guardada en el momento — siempre la puedes ver. Sabes en todo momento cuánto tendrás que pagar de impuestos. Y cuando llega el trimestre, se lo envías todo a tu asesor con un solo clic.
            </p>
            <div><Boton variante="secundario" onClick={onEmpezar}>Quiero probarlo</Boton></div>
          </div>
          <div style={{ flex: '1 1 340px', minWidth: 300, background: V('--fondo-panel'), borderRadius: V('--radio-xl'), boxShadow: V('--sombra-lg'), border: `1px solid ${V('--borde')}`, overflow: 'hidden' }}>
            <div style={{ background: V('--topo'), color: V('--blanco'), padding: '1rem 1.3rem' }}>
              <strong style={{ display: 'block', fontSize: '0.9rem' }}>Control fiscal trimestral</strong>
              <span style={{ fontSize: '0.72rem', opacity: 0.8 }}>¿Cuánto tendrás que pagar este trimestre?</span>
            </div>
            <div style={{ padding: '1.2rem 1.3rem', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
              <FiscalLinea label="IVA" valor="612 €" />
              <FiscalLinea label="IRPF" valor="380 €" />
              <FiscalLinea label="Cuota de autónomos" valor="294 €" />
              <FiscalLinea label="Amortizaciones" valor="−85 €" />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem', fontWeight: 800, borderTop: `1px solid ${V('--borde')}`, marginTop: '0.4rem', paddingTop: '0.7rem' }}>
                <span>Estimación total</span><span style={{ color: V('--ocre') }}>1.201 €</span>
              </div>
            </div>
            <div style={{ padding: '0 1.3rem 1.3rem' }}>
              <button
                type="button"
                onClick={() => setInformeGenerado(true)}
                style={{ width: '100%', justifyContent: 'center', border: '1px solid transparent', borderRadius: V('--radio'), padding: '0.65rem 1.3rem', fontSize: '0.86rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: V('--topo'), color: V('--blanco'), boxShadow: V('--sombra-xs') }}
              >
                Generar informe para mi asesor
              </button>
            </div>
            {informeGenerado && (
              <p style={{ margin: '0.6rem 1.3rem 1rem', fontSize: '0.74rem', color: V('--verde'), fontWeight: 700, textAlign: 'center' }}>Informe listo — envíaselo a tu asesor en un clic.</p>
            )}
          </div>
        </div>
      </section>

      <Ola fondo={V('--fondo-caja')} siguiente={V('--fondo')} variante="a" />

      {/* ── DIAGRAMA DE CONEXIÓN ── */}
      <section style={{ padding: '4rem 1.5rem', textAlign: 'center' }}>
        <span style={{ fontSize: '0.74rem', fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: V('--ocre') }}>De un vistazo</span>
        <h2 style={{ margin: '0.4rem auto 0.6rem', maxWidth: 700, fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: 800, letterSpacing: '-0.03em' }}>El ciclo completo de tu trabajo, conectado.</h2>
        <p style={{ margin: '0 auto 2.2rem', maxWidth: 620, color: V('--topo-claro'), fontSize: '0.92rem' }}>
          Madera Creativa Estudio no es un CRM más presupuestos más facturas más IA por separado. Es un único recorrido — el mismo dato viaja de un extremo a otro sin que lo vuelvas a escribir.
        </p>
        <div style={{ maxWidth: 1080, margin: '0 auto', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: '0.4rem' }}>
          {['Cliente', 'Obra', 'Mediciones', 'Presupuesto', 'Aceptación', 'Gastos', 'Facturas', 'Rentabilidad'].map((nodo) => (
            <span key={nodo} style={{ display: 'contents' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, padding: '0.6em 1em', borderRadius: V('--radio'), background: V('--fondo-panel'), border: `1px solid ${V('--borde')}`, boxShadow: V('--sombra-xs') }}>{nodo}</span>
              <span style={{ color: V('--topo-muy-claro'), fontSize: '0.9rem' }}>→</span>
            </span>
          ))}
          <span style={{ fontSize: '0.78rem', fontWeight: 700, padding: '0.6em 1em', borderRadius: V('--radio'), background: V('--ocre'), color: V('--blanco'), border: `1px solid ${V('--ocre')}` }}>Fiscalidad</span>
        </div>
      </section>

      <Ola fondo={V('--fondo')} siguiente={V('--ocre-bg')} variante="b" />

      {/* ── IA ── */}
      <section id="ia" style={{ padding: '4rem 1.5rem', background: V('--ocre-bg') }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <span style={{ fontSize: '0.74rem', fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: V('--ocre') }}>Y cuando ya conoce tus datos</span>
          <h2 style={{ margin: '0.4rem 0 0.6rem', fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: 800, letterSpacing: '-0.03em', maxWidth: 640 }}>Primero organizas tu negocio. Después, la aplicación te ayuda a decidir.</h2>
          <p style={{ margin: '0 0 2rem', maxWidth: 620, color: V('--topo-claro'), fontSize: '0.92rem', lineHeight: 1.6 }}>
            La inteligencia artificial no sustituye nada de lo anterior — lo aprovecha. Una vez que tus clientes, obras, precios y márgenes ya están dentro, Madera Creativa Estudio puede ayudarte a interpretarlos.
          </p>
          <div style={{ display: 'grid', gap: '1.1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}>
            {IA_TARJETAS.map((t) => (
              <div key={t.titulo} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', padding: '1.2rem', borderRadius: V('--radio-grande'), background: V('--fondo-panel'), border: `1px solid ${V('--borde')}` }}>
                <span style={{ color: V('--ocre') }}>{t.icono}</span>
                <strong style={{ fontSize: '0.88rem' }}>{t.titulo}</strong>
                <span style={{ fontSize: '0.8rem', lineHeight: 1.5, color: V('--topo-claro') }}>{t.texto}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Ola fondo={V('--ocre-bg')} siguiente={V('--topo')} variante="a" />

      {/* ── 60 DÍAS ── */}
      <section style={{ padding: '4rem 1.5rem', background: V('--topo'), color: V('--blanco'), textAlign: 'center' }}>
        <div style={{ maxWidth: 680, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.74rem', fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: '#d8c9a3' }}>La ventaja de lanzamiento</span>
          <h2 style={{ margin: 0, fontSize: 'clamp(1.7rem, 3.5vw, 2.4rem)', fontWeight: 900, letterSpacing: '-0.03em' }}>60 días para probarlo en tu negocio real.</h2>
          <p style={{ margin: 0, fontSize: '0.95rem', lineHeight: 1.6, color: '#d8cfc2', maxWidth: 560 }}>
            No es una demo de cinco minutos. Son dos meses completos para meter tus propios clientes, tus propias obras y tus propios números, y comprobar si de verdad encaja en tu forma de trabajar.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', justifyContent: 'center', margin: '0.4rem 0' }}>
            {['Sin tarjeta', 'Sin compromiso', 'Basic + Pro incluidos', '25 GB'].map((t) => (
              <span key={t} style={{ fontSize: '0.76rem', fontWeight: 700, padding: '0.4em 0.9em', borderRadius: 999, background: 'rgba(255,255,255,0.12)' }}>{t}</span>
            ))}
          </div>
          <div style={{ marginTop: '0.6rem' }}>
            <button type="button" onClick={onEmpezar} style={{ border: 'none', borderRadius: V('--radio'), padding: '0.95rem 1.9rem', fontSize: '1rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', background: V('--blanco'), color: V('--topo') }}>
              Empezar mis 60 días gratis
            </button>
          </div>
        </div>
      </section>

      <Ola fondo={V('--topo')} siguiente={V('--fondo')} variante="b" />

      {/* ── PLANES (reutiliza PaginaPlanes tal cual — cero precios/lógica duplicados) ── */}
      <section id="planes" style={{ padding: '4rem 1.5rem' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: V('--ocre') }}>Cuando termine tu prueba</span>
            <h2 style={{ margin: 0, fontSize: 'clamp(1.6rem, 3.2vw, 2.1rem)', fontWeight: 800, letterSpacing: '-0.03em' }}>Elige por lo que necesitas, no solo por lo que incluye.</h2>
            <p style={{ margin: 0, maxWidth: 520, fontSize: '0.88rem', color: V('--topo-claro') }}>Basic: yo gestiono. Pro: la aplicación me ayuda a trabajar. Premium: la aplicación me ayuda a decidir.</p>
          </div>
          <PaginaPlanes />
        </div>
      </section>

      <Ola fondo={V('--fondo')} siguiente={V('--fondo-caja')} variante="a" />

      {/* ── INSTALA EN TU DISPOSITIVO ── */}
      <section style={{ padding: '4rem 1.5rem', background: V('--fondo-caja'), textAlign: 'center' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.1rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.74rem', fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: V('--ocre') }}>En cualquier pantalla</span>
          <h2 style={{ margin: 0, fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: 800, letterSpacing: '-0.03em' }}>Instálala en tu dispositivo.</h2>
          <p style={{ margin: 0, color: V('--topo-claro'), fontSize: '0.92rem', lineHeight: 1.6, maxWidth: 520 }}>
            Sin tiendas de aplicaciones ni nada que descargar aparte: funciona desde el navegador y se instala como una app más, con su propio icono.
          </p>
          {/*
            Botón real de instalación (08/09/2026) — solo aparece cuando
            el propio navegador confirma que se puede instalar de
            verdad (Chrome/Edge en Android y en ordenador; `disponible`
            viene de `useInstalarApp`, ver ese archivo). En iPhone/iPad
            (Safari) esto nunca aparece — Apple no permite disparar
            "Añadir a pantalla de inicio" desde la propia página, así
            que ahí solo vale la instrucción manual de las dos tarjetas
            de abajo.
          */}
          {instalacionDisponible && (
            <button
              type="button"
              onClick={instalar}
              style={{ border: 'none', borderRadius: V('--radio'), padding: '0.8rem 1.6rem', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', background: V('--ocre'), color: V('--blanco'), display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
              Instalar aplicación ahora
            </button>
          )}
          {instalada && (
            <p style={{ margin: 0, color: V('--verde'), fontSize: '0.82rem', fontWeight: 700 }}>Ya la tienes instalada en este dispositivo.</p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.9rem', width: '100%', marginTop: '0.3rem' }}>
            <div style={E.descargaItem}>
              <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ color: V('--ocre') }}><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>
              <strong style={{ fontSize: '0.88rem' }}>Ordenador</strong>
              <span style={{ fontSize: '0.8rem', color: V('--topo-claro'), lineHeight: 1.4 }}>Entra desde el navegador y pulsa "Instalar aplicación" — queda como un programa más.</span>
            </div>
            <div style={E.descargaItem}>
              <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ color: V('--ocre') }}><rect x="5" y="2" width="14" height="20" rx="2" /><line x1="12" y1="18" x2="12.01" y2="18" /></svg>
              <strong style={{ fontSize: '0.88rem' }}>Móvil y tablet</strong>
              <span style={{ fontSize: '0.8rem', color: V('--topo-claro'), lineHeight: 1.4 }}>Añádela a tu pantalla de inicio desde el navegador — Android e iPhone/iPad incluidos.</span>
            </div>
          </div>
          <Boton variante="secundario" onClick={onEmpezar}>Empezar ahora</Boton>
        </div>
      </section>

      {/*
        Corrección (08/09/2026, decisión del cliente): el cierre se queda
        con bordes rectos, sin onda — es la única transición sin curva de
        toda la página.
      */}
      <section style={{ padding: '4.5rem 1.5rem 3.5rem', textAlign: 'center', background: V('--marca-oscura'), color: V('--blanco') }}>
        <div style={{ maxWidth: 620, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.1rem', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 'clamp(1.8rem, 3.6vw, 2.4rem)', fontWeight: 900, letterSpacing: '-0.03em', color: V('--blanco') }}>Empieza hoy tus 60 días gratis.</h2>
          <p style={{ margin: 0, color: '#d8cfc2', fontSize: '0.95rem' }}>Sin tarjeta. Sin compromiso. Con tu negocio real.</p>
          <button type="button" onClick={onEmpezar} style={{ border: 'none', borderRadius: V('--radio'), padding: '0.95rem 1.9rem', fontSize: '1rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', background: V('--ocre'), color: V('--blanco') }}>
            Quiero probarlo
          </button>
        </div>
      </section>

      {/* ── PIE ── */}
      <footer style={{ padding: '2.2rem 1.5rem', textAlign: 'center', borderTop: `1px solid ${V('--borde')}` }}>
        <p style={{ margin: 0, fontSize: '0.78rem', color: V('--topo-claro') }}>
          © {new Date().getFullYear()} Madera Creativa · ¿Ya tienes cuenta?{' '}
          <button type="button" onClick={onEntrar} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, font: 'inherit', color: V('--topo'), fontWeight: 700, textDecoration: 'underline' }}>
            Entrar
          </button>
        </p>
      </footer>
    </div>
  );
}

/* ───────────────────────── piezas pequeñas reutilizadas arriba ───────────────────────── */

function Paso({ num, ultimo, children }: { num: number; ultimo?: boolean; children: ReactNode }) {
  return (
    <div style={{ position: 'relative', paddingBottom: ultimo ? 0 : '2.6rem' }}>
      <div style={{ position: 'absolute', left: '-3.2rem', top: 0, width: 36, height: 36, borderRadius: '50%', background: V('--topo'), color: V('--blanco'), display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.9rem', boxShadow: V('--sombra-xs') }}>
        {num}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {children}
      </div>
    </div>
  );
}

function Partida({ label, valor }: { label: string; valor: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: V('--topo') }}>
      <span>{label}</span><span style={{ fontWeight: 700 }}>{valor}</span>
    </div>
  );
}

function FiscalLinea({ label, valor }: { label: string; valor: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.83rem', color: V('--topo') }}>
      <span>{label}</span><span style={{ fontWeight: 700 }}>{valor}</span>
    </div>
  );
}

const ICONO_IA_PROPS = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

const IA_TARJETAS = [
  {
    titulo: 'Asistente IA',
    texto: 'Pregúntale por tus clientes, proyectos o presupuestos en lenguaje natural.',
    icono: <svg {...ICONO_IA_PROPS}><path d="M12 2a4 4 0 0 0-4 4c0 1 .3 1.8.9 2.5A4 4 0 0 0 8 12v6a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-6a4 4 0 0 0-.9-3.5c.6-.7.9-1.5.9-2.5a4 4 0 0 0-4-4Z" /><line x1="9" y1="21" x2="15" y2="21" /></svg>,
  },
  {
    titulo: 'Inteligencia de precios',
    texto: 'Compara cada trabajo con tu propio histórico para saber si estás cobrando bien.',
    icono: <svg {...ICONO_IA_PROPS}><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></svg>,
  },
  {
    titulo: 'Investigación de mercado',
    texto: 'La IA busca referencias reales de precios de tu zona para ese tipo de trabajo.',
    icono: <svg {...ICONO_IA_PROPS}><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>,
  },
  {
    titulo: 'Copiloto visual de presupuestos',
    texto: 'Sube una foto del trabajo y deja que te ayude a montar el presupuesto.',
    icono: <svg {...ICONO_IA_PROPS}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-5-5L5 21" /></svg>,
  },
];

const E = {
  pasoFrase: { margin: 0, fontSize: '1.15rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--negro)' } as CSSProperties,
  pasoDetalle: { margin: 0, fontSize: '0.88rem', lineHeight: 1.6, color: 'var(--topo-claro)', maxWidth: 560 } as CSSProperties,
  chip: { fontSize: '0.7rem', fontWeight: 700, padding: '0.25em 0.7em', borderRadius: 999, background: 'var(--fondo-caja)', border: '1px solid var(--borde)', color: 'var(--topo)' } as CSSProperties,
  cadenaNodo: { fontSize: '0.76rem', fontWeight: 700, padding: '0.5em 0.9em', borderRadius: 'var(--radio)', background: 'var(--fondo-panel)', border: '1px solid var(--borde)' } as CSSProperties,
  descargaItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', textAlign: 'center', padding: '1.2rem 1rem', borderRadius: 'var(--radio-grande)', background: 'var(--fondo-panel)', border: '1px solid var(--borde)' } as CSSProperties,
  redactado: (ancho: number): CSSProperties => ({ display: 'inline-block', width: ancho, height: '0.85em', borderRadius: 3, background: 'var(--topo-muy-claro)', opacity: 0.55, verticalAlign: 'middle' }),
};
