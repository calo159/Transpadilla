import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { Radio, Timer, Gauge, Route as RouteIcon, Loader2, BarChart3, FileDown, FileText } from "lucide-react";
import { apiFetch } from "@/lib/api";

interface Stats { totalBuses: number; busesActivos: number }
interface ResumenRuta {
  ruta_id: number;
  nombre: string;
  color: string;
  km: number;
  muestras: number;
  buses: number;
}
interface Resumen {
  dias: number;
  km_total: number;
  buses_activos: number;
  rutas: ResumenRuta[];
}
interface Ocupacion { dias: number; vacio: number; medio: number; lleno: number }
interface Frecuencia { espera_estimada_min: number | null; global_headway_min: number | null }

interface Kpis { pctGps: number; activos: number; totalBuses: number; esperaTxt: string }

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

const hoyISO = () => new Date().toISOString().slice(0, 10);

/** Escapa un campo para CSV (comillas si trae coma/comilla/salto de línea). */
function csvCampo(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Descarga el resumen en pantalla como CSV (KPIs + km por ruta + ocupación). */
function descargarCSV(resumen: Resumen, ocup: Ocupacion, kpis: Kpis) {
  const lineas: string[] = [];
  lineas.push(`TransPadilla - Resumen ejecutivo (${resumen.dias} dias) - ${hoyISO()}`);
  lineas.push("");
  lineas.push("Indicadores");
  lineas.push(["Indicador", "Valor"].join(","));
  lineas.push([csvCampo("Buses con GPS activo"), csvCampo(`${kpis.pctGps}% (${kpis.activos}/${kpis.totalBuses})`)].join(","));
  lineas.push([csvCampo("Espera estimada"), csvCampo(kpis.esperaTxt)].join(","));
  lineas.push([csvCampo("Km recorridos"), resumen.km_total].join(","));
  lineas.push([csvCampo("Buses con actividad"), resumen.buses_activos].join(","));
  lineas.push("");
  lineas.push("Kilometros recorridos por ruta");
  lineas.push(["Ruta", "Km", "Muestras", "Buses"].join(","));
  for (const r of resumen.rutas) {
    lineas.push([csvCampo(r.nombre), r.km, r.muestras, r.buses].join(","));
  }
  lineas.push(["TOTAL", resumen.km_total, "", resumen.buses_activos].join(","));
  lineas.push("");
  lineas.push("Reportes de ocupacion");
  lineas.push(["Nivel", "Muestras"].join(","));
  lineas.push(["Vacio", ocup.vacio].join(","));
  lineas.push(["Medio", ocup.medio].join(","));
  lineas.push(["Lleno", ocup.lleno].join(","));

  const blob = new Blob(["﻿" + lineas.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `resumen-transpadilla-${hoyISO()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Genera un PDF con jspdf (import dinámico para no cargar el bundle público). */
async function descargarPDF(resumen: Resumen, ocup: Ocupacion, kpis: Kpis) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.setTextColor(27, 59, 111); // navy
  doc.text("TransPadilla", 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(107, 114, 128);
  doc.text("Moviendo la Ciudad — Resumen ejecutivo", 14, 24);
  doc.text(`Periodo: últimos ${resumen.dias} días   ·   Generado: ${hoyISO()}`, 14, 30);

  // Bloque de KPIs (lo que se muestra a una empresa de un vistazo).
  autoTable(doc, {
    startY: 38,
    head: [["Indicador", "Valor"]],
    body: [
      ["Buses con GPS activo", `${kpis.pctGps}% (${kpis.activos}/${kpis.totalBuses})`],
      ["Espera estimada", kpis.esperaTxt],
      ["Km recorridos", `${resumen.km_total} km`],
      ["Buses con actividad", String(resumen.buses_activos)],
    ],
    headStyles: { fillColor: [27, 59, 111] },
    styles: { fontSize: 9 },
  });

  let y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 46;
  autoTable(doc, {
    startY: y + 8,
    head: [["Ruta", "Km", "Muestras", "Buses"]],
    body: resumen.rutas.map((r) => [r.nombre, String(r.km), String(r.muestras), String(r.buses)]),
    foot: [["TOTAL", String(resumen.km_total), "", String(resumen.buses_activos)]],
    headStyles: { fillColor: [27, 59, 111] },
    footStyles: { fillColor: [37, 88, 165], textColor: 255 },
    styles: { fontSize: 9 },
  });

  y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 46;
  autoTable(doc, {
    startY: y + 8,
    head: [["Ocupación", "Muestras"]],
    body: [
      ["Vacío", String(ocup.vacio)],
      ["Medio", String(ocup.medio)],
      ["Lleno", String(ocup.lleno)],
    ],
    headStyles: { fillColor: [27, 59, 111] },
    styles: { fontSize: 9 },
  });

  doc.save(`resumen-transpadilla-${hoyISO()}.pdf`);
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

/**
 * Tab "Resumen ejecutivo": el reporte de cómo van las cosas, presentable a una
 * empresa. Combina KPIs de un vistazo, km recorridos por ruta, ocupación y la
 * descarga en PDF/CSV.
 */
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

  const rutas = resumen.data?.rutas ?? [];
  const sinHistorial = !cargando && rutas.length === 0;

  const kpis: Kpis = { pctGps, activos, totalBuses, esperaTxt };

  const datosOcup = ocup.data
    ? [
        { nivel: "Vacío", valor: ocup.data.vacio, color: "#38A169" },
        { nivel: "Medio", valor: ocup.data.medio, color: "#F5B731" },
        { nivel: "Lleno", valor: ocup.data.lleno, color: "#E53E3E" },
      ].filter((d) => d.valor > 0)
    : [];

  const puedeExportar = !cargando && resumen.data != null && ocup.data != null && !sinHistorial;

  return (
    <div className="space-y-5">
      {/* Selector de periodo + exportar */}
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
        {puedeExportar && (
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => descargarCSV(resumen.data!, ocup.data!, kpis)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
              style={{ background: "var(--color-secondary, #eef2f7)", color: "var(--color-navy, #1B3B6F)" }}
              aria-label="Exportar resumen a CSV"
            >
              <FileDown className="w-3.5 h-3.5" /> CSV
            </button>
            <button
              onClick={() => { void descargarPDF(resumen.data!, ocup.data!, kpis); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-colors"
              style={{ background: "var(--color-blue, #2558A5)" }}
              aria-label="Exportar resumen a PDF"
            >
              <FileText className="w-3.5 h-3.5" /> PDF
            </button>
          </div>
        )}
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

          {sinHistorial ? (
            <div className="bg-card border border-border rounded-xl p-8 text-center">
              <BarChart3 className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm font-bold text-foreground">Aún no hay datos de historial</p>
              <p className="text-xs text-muted-foreground mt-1">
                Los reportes se llenan a medida que los buses circulan y transmiten su posición.
                Vuelve cuando haya recorridos registrados.
              </p>
            </div>
          ) : (
            <>
              {/* Km recorridos por ruta */}
              <div className="rounded-2xl p-5 shadow-sm" style={{ background: "#fff", border: "1px solid #e5e7eb" }}>
                <h3 className="text-sm font-bold mb-3 flex items-center gap-2" style={{ color: "var(--color-navy, #1B3B6F)" }}>
                  <RouteIcon className="w-4 h-4" style={{ color: "var(--color-blue, #2558A5)" }} /> Kilómetros recorridos por ruta ({dias} días)
                </h3>
                <ResponsiveContainer width="100%" height={Math.max(160, rutas.length * 42)}>
                  <BarChart data={rutas} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid horizontal={false} stroke="#eef2f7" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: "#6B7280" }} />
                    <YAxis type="category" dataKey="nombre" width={120} tick={{ fontSize: 11, fill: "#1B3B6F" }} />
                    <Tooltip formatter={(v: number) => [`${v} km`, "Distancia"]} cursor={{ fill: "rgba(37,88,165,0.06)" }} />
                    <Bar dataKey="km" radius={[0, 6, 6, 0]}>
                      {rutas.map((r) => <Cell key={r.ruta_id} fill={r.color || "#2558A5"} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Distribución de ocupación (torta) */}
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
            </>
          )}

          <p className="text-[11px] text-center" style={{ color: "var(--color-gray-text, #6B7280)" }}>
            La "espera estimada" es un proxy calculado desde el intervalo entre buses; no es una medición directa del tiempo de espera.
          </p>
        </>
      )}
    </div>
  );
}
