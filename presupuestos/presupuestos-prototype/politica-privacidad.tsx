import { Link } from 'react-router-dom';
import styles from './styles.module.css';

/**
 * Política de privacidad — página pública, sin login, requerida por Google
 * Play (ficha de la app) y buena práctica de cara al RGPD. Contenido
 * estático: no depende de ningún dato de cuenta ni de sesión.
 */
export function PoliticaPrivacidad() {
  return (
    <div className={styles.app} style={{ minHeight: '100vh', background: 'var(--fondo)', display: 'flex', justifyContent: 'center', padding: '1.25rem 1rem 3rem' }}>
      <div style={{ width: '100%', maxWidth: '640px' }}>
        <div className={styles.panel} style={{ lineHeight: 1.6, fontSize: '0.92rem' }}>
          <h1 style={{ margin: '0 0 0.2rem' }}>Política de privacidad</h1>
          <p style={{ color: 'var(--topo-claro)', fontSize: '0.85rem', margin: '0 0 1.5rem' }}>Madera Creativa Estudio · Última actualización: 18 de agosto de 2026</p>

          <h2 style={{ fontSize: '1.05rem' }}>1. Responsable</h2>
          <p>
            Madera Creativa Estudio (Canarias, España) es responsable del tratamiento de los datos que se describen en esta
            política. Puedes contactar en cualquier momento en{' '}
            <a href="mailto:holamaderacreativa@gmail.com" style={{ color: 'var(--ocre)', fontWeight: 600 }}>holamaderacreativa@gmail.com</a>.
          </p>

          <h2 style={{ fontSize: '1.05rem' }}>2. Qué datos tratamos</h2>
          <ul style={{ paddingLeft: '1.2rem' }}>
            <li><strong>Datos de la cuenta:</strong> nombre de usuario y contraseña (cifrada), para poder iniciar sesión.</li>
            <li><strong>Datos de tus clientes:</strong> nombre, contacto y cualquier otro dato que introduzcas al gestionar presupuestos, facturas y proyectos.</li>
            <li><strong>Datos económicos:</strong> importes, condiciones de pago, facturas y cobros asociados a tus proyectos.</li>
            <li><strong>Fotografías y documentos:</strong> los que subas mediante el escáner de facturas, la galería de fotos o los adjuntos de cada cliente.</li>
            <li><strong>Verificación biométrica (huella / Face ID):</strong> si activas el acceso biométrico, tu dispositivo verifica tu identidad de forma local — el dato biométrico en sí nunca sale de tu dispositivo ni llega a nuestros servidores; solo recibimos la confirmación de que la verificación fue correcta.</li>
            <li><strong>Notificaciones push:</strong> si las activas, guardamos un identificador técnico de suscripción de tu navegador/dispositivo para poder enviarte los avisos que tú mismo configures.</li>
          </ul>

          <h2 style={{ fontSize: '1.05rem' }}>3. Para qué los usamos</h2>
          <p>
            Únicamente para el funcionamiento de la propia aplicación: gestionar tus clientes, proyectos, presupuestos y
            facturas, y enviarte los recordatorios que tú mismo configures. No usamos tus datos con fines publicitarios,
            no los vendemos ni los compartimos con terceros.
          </p>

          <h2 style={{ fontSize: '1.05rem' }}>4. Dónde se almacenan</h2>
          <p>
            Los datos se guardan en MongoDB Atlas, con acceso protegido mediante autenticación (tokens JWT). El acceso a
            la aplicación está restringido a los usuarios dados de alta.
          </p>

          <h2 style={{ fontSize: '1.05rem' }}>5. Cuánto tiempo se conservan</h2>
          <p>
            Mientras tu cuenta permanezca activa. Si quieres que eliminemos tus datos o los de un cliente concreto,
            escríbenos y lo haremos en el plazo más breve posible.
          </p>

          <h2 style={{ fontSize: '1.05rem' }}>6. Tus derechos</h2>
          <p>
            Puedes solicitar en cualquier momento el acceso, la rectificación o la eliminación de tus datos, escribiendo
            a <a href="mailto:holamaderacreativa@gmail.com" style={{ color: 'var(--ocre)', fontWeight: 600 }}>holamaderacreativa@gmail.com</a>.
          </p>

          <h2 style={{ fontSize: '1.05rem' }}>7. Cookies y almacenamiento local</h2>
          <p>
            La aplicación guarda en tu dispositivo (almacenamiento local del navegador) el token de sesión y tus
            preferencias de uso, como el modo privacidad. No usamos cookies de rastreo ni herramientas de analítica de
            terceros.
          </p>

          <h2 style={{ fontSize: '1.05rem' }}>8. Cambios en esta política</h2>
          <p>Si actualizamos este documento, cambiaremos la fecha de "última actualización" que aparece arriba.</p>

          <Link to="/" style={{ display: 'inline-block', marginTop: '1rem', color: 'var(--ocre)', fontWeight: 600, fontSize: '0.85rem' }}>
            ← Volver a Madera Creativa
          </Link>
        </div>
      </div>
    </div>
  );
}
