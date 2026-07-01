import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, CartesianGrid,
} from "recharts";
import { Route as RouteIcon, Gauge, Users, Loader2, BarChart3, FileDown, FileText } from "lucide-react";
import { apiFetch } from "@/lib/api";

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

/** Descarga los datos en pantalla como CSV. */
function descargarCSV(resumen: Resumen, ocup: Ocupacion) {
  const lineas: string[] = [];
  lineas.push(`TransPadilla - Reporte (${resumen.dias} dias) - ${hoyISO()}`);
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
  a.download = `reporte-transpadilla-${hoyISO()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Genera un PDF simple con jspdf (import dinámico para no cargar el bundle público). */
async function descargarPDF(resumen: Resumen, ocup: Ocupacion) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.setTextColor(27, 59, 111); // navy
  doc.text("TransPadilla", 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(107, 114, 128);
  doc.text("Moviendo la Ciudad — Reporte de operación", 14, 24);
  doc.text(`Periodo: últimos ${resumen.dias} días   ·   Generado: ${hoyISO()}`, 14, 30);

  autoTable(doc, {
    startY: 38,
    head: [["Ruta", "Km", "Muestras", "Buses"]],
    body: resumen.rutas.map((r) => [r.nombre, String(r.km), String(r.muestras), String(r.buses)]),
    foot: [["TOTAL", String(resumen.km_total), "", String(resumen.buses_activos)]],
    headStyles: { fillColor: [27, 59, 111] },
    footStyles: { fillColor: [37, 88, 165], textColor: 255 },
    styles: { fontSize: 9 },
  });

  const y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 46;
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

  doc.save(`reporte-transpadilla-${hoyISO()}.pdf`);
}

/** Tab "Reportes": km recorridos por ruta y ocupación, sobre el historial. */
export default function ReportesTab() {
  const [dias, setDias] = useState<number>(7);

  const resumen = useQuery({
    queryKey: ["reportes-resumen", dias],
    queryFn: () => getJson<Resumen>(`/api/reportes/resumen?dias=${dias}`),
  });
  const ocup = useQuery({
    queryKey: ["reportes-ocupacion", dias],
    queryFn: () => getJson<Ocupacion>(`/api/reportes/ocupacion?dias=${dias}`),
  });

  const cargando = resumen.isLoading || ocup.isLoading;
  const rutas = resumen.data?.rutas ?? [];
  const sinDatos = !cargando && rutas.length === 0;

  const datosOcup = ocup.data
    ? [
        { nivel: "Vacío", valor: ocup.data.vacio, color: "#38A169" },
        { nivel: "Medio", valor: ocup.data.medio, color: "#F5B731" },
        { nivel: "Lleno", valor: ocup.data.lleno, color: "#E53E3E" },
      ]
    : [];

  return (
    <div className="space-y-5">
      {/* Selector de rango + exportar */}
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
        {!sinDatos && !cargando && resumen.data && ocup.data && (
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => descargarCSV(resumen.data!, ocup.data!)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
              style={{ background: "var(--color-secondary, #eef2f7)", color: "var(--color-navy, #1B3B6F)" }}
              aria-label="Exportar reporte a CSV"
            >
              <FileDown className="w-3.5 h-3.5" /> CSV
            </button>
            <button
              onClick={() => { void descargarPDF(resumen.data!, ocup.data!); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-colors"
              style={{ background: "var(--color-blue, #2558A5)" }}
              aria-label="Exportar reporte a PDF"
            >
              <FileText className="w-3.5 h-3.5" /> PDF
            </button>
          </div>
        )}
      </div>

      {cargando ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando reportes…
        </div>
      ) : sinDatos ? (
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
          {/* Tarjetas resumen */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { icon: <Gauge className="w-4 h-4" />, label: "Km recorridos", valor: `${resumen.data?.km_total ?? 0} km` },
              { icon: <Users className="w-4 h-4" />, label: "Buses con actividad", valor: resumen.data?.buses_activos ?? 0 },
              { icon: <RouteIcon className="w-4 h-4" />, label: "Rutas con datos", valor: rutas.length },
            ].map((c, i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1">{c.icon}{c.label}</p>
                <p className="text-2xl font-black text-foreground">{c.valor}</p>
              </div>
            ))}
          </div>

          {/* Km por ruta */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
              <RouteIcon className="w-4 h-4 text-primary" /> Kilómetros recorridos por ruta
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

          {/* Ocupación */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" /> Reportes de ocupación ({dias} días)
            </h3>
            {datosOcup.every((d) => d.valor === 0) ? (
              <p className="text-xs text-muted-foreground py-6 text-center">Sin reportes de ocupación en el periodo.</p>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={datosOcup} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid vertical={false} stroke="#eef2f7" />
                  <XAxis dataKey="nivel" tick={{ fontSize: 11, fill: "#1B3B6F" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#6B7280" }} />
                  <Tooltip formatter={(v: number) => [v, "Muestras"]} cursor={{ fill: "rgba(37,88,165,0.06)" }} />
                  <Bar dataKey="valor" radius={[6, 6, 0, 0]}>
                    {datosOcup.map((d) => <Cell key={d.nivel} fill={d.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </>
      )}
    </div>
  );
}
