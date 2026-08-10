import { Component, type ReactNode, type ErrorInfo } from 'react';

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * ErrorBoundary global — captura cualquier crash de React y muestra
 * un mensaje de error en lugar de una pantalla en blanco.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Madera Creativa] Error:', error.message, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: '#f8f6f2', fontFamily: 'Inter, sans-serif', padding: '2rem', margin: 0,
        }}>
          <h2 style={{ color: '#51483f', marginBottom: '0.5rem', fontSize: '1.2rem' }}>
            Error inesperado
          </h2>
          <p style={{ color: '#7a7060', fontSize: '0.85rem', marginBottom: '1.5rem', maxWidth: 400, textAlign: 'center' }}>
            {this.state.error.message}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: '#51483f', color: '#fff', border: 'none', borderRadius: 8,
              padding: '0.75rem 2rem', cursor: 'pointer', fontSize: '0.9rem',
            }}
          >
            Recargar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
