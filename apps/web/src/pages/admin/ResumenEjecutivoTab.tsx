import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import { Radio, Timer, Gauge, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";

interface Stats { totalBuses: number; busesActivos: number }
interface Resumen { km_total: number }
interface Ocupacion { vacio: number; medio: number; lleno: number }
interface Frecuencia { espera_estimada_min: number | null; global_headway_min: number | null }

const RANGOS = [
  { label: "7 días", dias: 7 },
  { label: "30 días", dias: 30 },
  { label: "90 días", dias: 90 },
] as const;

async function getJson<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Tarjeta grande de KPI, estilo "panel ejecutivo". */
function KpiCard({ icon, label, valor, nota, color }: {
  icon: React.ReactNode; label: string; valor: string; nota?: string; color: string;
}) {
  return (
    <div className="rounded-2xl p-5 flex flex-col gap-2 shadow-sm" style={{ background: "#fff", border: "1px solid #e5e7eb" }}>
      <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: "var(--color-gray-text, #6B7280)" }}>
        <span className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${color}1a`, color }}>{icon}</span>
        {label}
      </div>
      <p className="text-4xl font-black leading-none" style={{ color: "var(--color-navy, #1B3B6F)" }}>{valor}</p>
      {nota && <p className="text-[11px]" style={{ color: "var(--color-gray-text, #6B7280)" }}>{nota}</p>}
    </div>
  );
}

/** Tab "Resumen ejecutivo": KPIs de un vistazo para un funcionario. */
export default function ResumenEjecutivoTab() {
  const [dias, setDias] = useState<number>(7);

  const stats = useQuery({ queryKey: ["stats-exec"], queryFn: () => getJson<Stats>("/api/stats") });
  const resumen = useQuery({ queryKey: ["resumen-exec", dias], queryFn: () => getJson<Resumen>(`/api/reportes/resumen?dias=${dias}`) });
  const ocup = useQuery({ queryKey: ["ocup-exec", dias], queryFn: () => getJson<Ocupacion>(`/api/reportes/ocupacion?dias=${dias}`) });
  const frec = useQuery({ queryKey: ["frec-exec", dias], queryFn: () => getJson<Frecuencia>(`/api/reportes/frecuencia?dias=${dias}`) });

  const cargando = stats.isLoading || resumen.isLoading || ocup.isLoading || frec.isLoading;

  const totalBuses = stats.data?.totalBuses ?? 0;
  const activos = stats.data?.busesActivos ?? 0;
  const pctGps = totalBuses > 0 ? Math.round((activos / totalBuses) * 100) : 0;

  const espera = frec.data?.espera_estimada_min;
  const esperaTxt = espera != null ? `${espera} min` : "—";

  const datosOcup = ocup.data
    ? [
        { nivel: "Vacío", valor: ocup.data.vacio, color: "#38A169" },
        { nivel: "Medio", valor: ocup.data.medio, color: "#F5B731" },
        { nivel: "Lleno", valor: ocup.data.lleno, color: "#E53E3E" },
      ].filter((d) => d.valor > 0)
    : [];

  return (
    <div className="space-y-5">
      {/* Selector de periodo */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-muted-foreground">Periodo:</span>
        {RANGOS.map((r) => (
          <button
            key={r.dias}
            onClick={() => setDias(r.dias)}
            className="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
            style={dias === r.dias
              ? { background: "var(--color-blue, #2558A5)", color: "#fff" }
              : { background: "var(--color-secondary, #eef2f7)", color: "var(--color-navy, #1B3B6F)" }}
          >
            {r.label}
          </button>
        ))}
      </div>

      {cargando ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando resumen…
        </div>
      ) : (
        <>
          {/* KPIs grandes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <KpiCard
              icon={<Radio className="w-4 h-4" />}
              label="Buses con GPS activo"
              valor={`${pctGps}%`}
              nota={`${activos} de ${totalBuses} buses transmitiendo ahora`}
              color="#38A169"
            />
            <KpiCard
              icon={<Timer className="w-4 h-4" />}
              label="Espera estimada"
              valor={esperaTxt}
              nota={espera != null ? "estimado (intervalo entre buses ÷ 2)" : "No disponible aún — requiere más historial de recorridos"}
              color="#2558A5"
            />
            <KpiCard
              icon={<Gauge className="w-4 h-4" />}
              label="Km recorridos"
              valor={`${resumen.data?.km_total ?? 0} km`}
              nota={`en los últimos ${dias} días`}
              color="#F5B731"
            />
          </div>

          {/* Distribución de ocupación (gráfico) */}
          <div className="rounded-2xl p-5 shadow-sm" style={{ background: "#fff", border: "1px solid #e5e7eb" }}>
            <h3 className="text-sm font-bold mb-2" style={{ color: "var(--color-navy, #1B3B6F)" }}>
              Distribución de ocupación reportada ({dias} días)
            </h3>
            {datosOcup.length === 0 ? (
              <p className="text-xs text-muted-foreground py-8 text-center">Sin reportes de ocupación en el periodo.</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={datosOcup} dataKey="valor" nameKey="nivel" cx="50%" cy="50%" outerRadius={90} label>
                    {datosOcup.map((d) => <Cell key={d.nivel} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => [v, "Muestras"]} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          <p className="text-[11px] text-center" style={{ color: "var(--color-gray-text, #6B7280)" }}>
            La "espera estimada" es un proxy calculado desde el intervalo entre buses; no es una medición directa del tiempo de espera.
          </p>
        </>
      )}
    </div>
  );
}
