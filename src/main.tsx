import { Component, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { NOC_STORAGE_KEY } from './state/useNocStore';
import './index.css';

/**
 * Red de seguridad: si algo falla al pintar (por ejemplo, un estado guardado incompatible con esta
 * versión), en lugar de una página en blanco se ofrece restablecer el laboratorio.
 */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('NOC Monitor Lab:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[#0b0f19] text-slate-100">
        <div className="max-w-md w-full rounded-xl border border-[#1f2937] bg-[#111827] p-6 space-y-4">
          <h1 className="text-lg font-semibold">El laboratorio no ha podido cargarse</h1>
          <p className="text-sm text-slate-400">
            El estado guardado en este navegador no es compatible con esta versión. Puedes restablecer el
            laboratorio para empezar un turno nuevo.
          </p>
          <button
            type="button"
            onClick={() => {
              try {
                window.localStorage.removeItem(NOC_STORAGE_KEY);
              } catch {
                // Ignorar errores de almacenamiento
              }
              window.location.reload();
            }}
            className="px-4 py-2 rounded-md bg-sky-600 hover:bg-sky-500 text-sm font-semibold text-white"
          >
            Restablecer el laboratorio
          </button>
        </div>
      </div>
    );
  }
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
