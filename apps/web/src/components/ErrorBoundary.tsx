import { Component, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

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
        <div
          className="min-h-screen flex items-center justify-center p-6"
          style={{ background: "var(--color-gray-light)" }}
        >
          <div
            className="max-w-sm w-full text-center rounded-2xl overflow-hidden shadow-xl"
            style={{ background: "#fff" }}
          >
            <div style={{ height: 4, background: "var(--color-danger)" }} />
            <div className="p-6">
              <div
                className="w-14 h-14 mx-auto mb-3 rounded-full flex items-center justify-center"
                style={{ background: "color-mix(in srgb, var(--color-danger) 12%, #fff)" }}
              >
                <AlertTriangle className="w-7 h-7" style={{ color: "var(--color-danger)" }} />
              </div>
              <h1 className="text-lg font-bold mb-1" style={{ color: "var(--color-navy)" }}>
                Algo salió mal
              </h1>
              <p className="text-sm mb-5" style={{ color: "var(--color-gray-text)" }}>
                Ocurrió un error inesperado. Por favor recarga la página.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="w-full h-11 rounded-xl font-bold text-white border-0 active:scale-95 transition-transform"
                style={{ background: "var(--color-blue)" }}
              >
                Recargar
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
