import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
}

/**
 * Captura errores de render de cualquier parte de la app y muestra una pantalla
 * amable (en vez de una pantalla blanca), con opción de recargar.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    // En producción esto podría enviarse a un servicio de monitoreo.
    console.error("ErrorBoundary atrapó un error:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-6">
          <div className="max-w-sm w-full text-center bg-card border border-border rounded-2xl p-6 shadow-xl">
            <div className="text-4xl mb-3">🚧</div>
            <h1 className="text-lg font-bold text-foreground mb-1">Algo salió mal</h1>
            <p className="text-sm text-muted-foreground mb-5">
              Ocurrió un error inesperado. Por favor recarga la página.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full h-11 rounded-xl font-bold text-white border-0"
              style={{ background: "linear-gradient(135deg, #1757C2 0%, var(--tp-sky) 100%)" }}
            >
              Recargar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
