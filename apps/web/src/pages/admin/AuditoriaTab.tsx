import { useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Loader2, ShieldCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { apiFetch } from "@/lib/api";

interface Registro {
  id: number;
  accion: string;
  entidad_tipo: string | null;
  entidad_id: number | null;
  detalle: unknown;
  creado_en: string;
  usuario_nombre: string | null;
}
interface Respuesta { limite: number; offset: number; total: number; registros: Registro[] }

const LIMITE = 25;

async function getJson<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Etiqueta legible para la acción (ej. "crear_ruta" → "Crear ruta"). */
function accionLegible(a: string): string {
  const t = a.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Tab "Auditoría": historial de acciones administrativas. */
export default function AuditoriaTab() {
  const [pagina, setPagina] = useState(0);
  const offset = pagina * LIMITE;

  const q = useQuery({
    queryKey: ["auditoria", offset],
    queryFn: () => getJson<Respuesta>(`/api/auditoria?limite=${LIMITE}&offset=${offset}`),
    placeholderData: keepPreviousData,
  });

  const registros = q.data?.registros ?? [];
  const total = q.data?.total ?? 0;
  const maxPagina = Math.max(0, Math.ceil(total / LIMITE) - 1);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-5 h-5" style={{ color: "var(--color-blue, #2558A5)" }} />
        <h3 className="text-sm font-bold" style={{ color: "var(--color-navy, #1B3B6F)" }}>
          Registro de acciones administrativas
        </h3>
        <span className="text-xs text-muted-foreground ml-auto">{total} registros</span>
      </div>

      {q.isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando…
        </div>
      ) : registros.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <p className="text-sm font-bold text-foreground">Aún no hay acciones registradas</p>
          <p className="text-xs text-muted-foreground mt-1">Las mutaciones del panel (crear/editar/eliminar) aparecerán aquí.</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "var(--color-navy, #1B3B6F)", color: "#fff" }}>
                  <th className="text-left font-semibold px-3 py-2">Fecha</th>
                  <th className="text-left font-semibold px-3 py-2">Usuario</th>
                  <th className="text-left font-semibold px-3 py-2">Acción</th>
                  <th className="text-left font-semibold px-3 py-2">Entidad</th>
                </tr>
              </thead>
              <tbody>
                {registros.map((r, i) => (
                  <tr key={r.id} style={{ background: i % 2 ? "#F4F6F9" : "#fff" }}>
                    <td className="px-3 py-2 whitespace-nowrap text-xs" style={{ color: "var(--color-gray-text, #6B7280)" }}>
                      {new Date(r.creado_en).toLocaleString("es-CO")}
                    </td>
                    <td className="px-3 py-2" style={{ color: "var(--color-navy, #1B3B6F)" }}>{r.usuario_nombre ?? "—"}</td>
                    <td className="px-3 py-2 font-semibold" style={{ color: "var(--color-navy, #1B3B6F)" }}>{accionLegible(r.accion)}</td>
                    <td className="px-3 py-2 text-xs" style={{ color: "var(--color-gray-text, #6B7280)" }}>
                      {r.entidad_tipo ? `${r.entidad_tipo}${r.entidad_id != null ? ` #${r.entidad_id}` : ""}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {maxPagina > 0 && (
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setPagina((p) => Math.max(0, p - 1))}
                disabled={pagina === 0}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-40"
                style={{ background: "var(--color-secondary, #eef2f7)", color: "var(--color-navy, #1B3B6F)" }}
                aria-label="Página anterior"
              >
                <ChevronLeft className="w-4 h-4" /> Anterior
              </button>
              <span className="text-xs text-muted-foreground">Página {pagina + 1} de {maxPagina + 1}</span>
              <button
                onClick={() => setPagina((p) => Math.min(maxPagina, p + 1))}
                disabled={pagina >= maxPagina}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-40"
                style={{ background: "var(--color-secondary, #eef2f7)", color: "var(--color-navy, #1B3B6F)" }}
                aria-label="Página siguiente"
              >
                Siguiente <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
