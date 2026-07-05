import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from "recharts";
import {
  Star, Clock, CalendarDays, Users2, Loader2, BarChart3, FileDown, FileText,
  Trophy, ArrowUpDown, Route as RouteIcon,
} from "lucide-react";
import { apiFetch } from "@/lib/api";

interface RutaInsight {
  ruta_id: number; nombre: string; color: string;
  km: number; buses: number; muestras: number;
  vacio: number; medio: number; lleno: number;
  seguidores: number; opero: boolean;
}
interface RutasInsights { dias: number; rutas: RutaInsight[] }
interface Actividad {
  dias: number;
  horas: { h: number; muestras: number; llenos: number }[];
  dias_semana: { dow: number; muestras: number; llenos: number }[];
}

const RANGOS = [
  { label: "7 días", dias: 7 },
  { label: "30 días", dias: 30 },
  { label: "90 días", dias: 90 },
] as const;

const DOW = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"] as const;
const MEDALLA = ["#F5B731", "#9ca3af", "#b45309"] as const; // oro, plata, bronce

async function getJson<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

const hoyISO = () => new Date().toISOString().slice(0, 10);
const fmtHora = (h: number) => `${String(h).padStart(2, "0")}:00`;
const pctLleno = (r: RutaInsight) => {
  const tot = r.vacio + r.medio + r.lleno;
  return tot > 0 ? Math.round((r.lleno / tot) * 100) : 0;
};

/** Escapa un campo para CSV. */
function csvCampo(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function descargarCSV(dias: number, rutas: RutaInsight[], act: Actividad) {
  const L: string[] = [];
  L.push(`TransPadilla - Resumen ejecutivo (${dias} dias) - ${hoyISO()}`);
  L.push("");
  L.push("Ranking de rutas");
  L.push(["Ruta", "Seguidores", "% Lleno", "Km", "Buses", "Opero"].join(","));
  for (const r of rutas) {
    L.push([csvCampo(r.nombre), r.seguidores, `${pctLleno(r)}%`, r.km, r.buses, r.opero ? "Si" : "No"].join(","));
  }
  L.push("");
  L.push("Actividad por hora (muestras de buses circulando)");
  L.push(["Hora", "Muestras", "Con bus lleno"].join(","));
  for (const x of act.horas) L.push([fmtHora(x.h), x.muestras, x.llenos].join(","));
  L.push("");
  L.push("Actividad por dia de la semana");
  L.push(["Dia", "Muestras", "Con bus lleno"].join(","));
  for (const x of act.dias_semana) L.push([DOW[x.dow] ?? x.dow, x.muestras, x.llenos].join(","));

  const blob = new Blob(["﻿" + L.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `resumen-transpadilla-${hoyISO()}.csv`; a.click();
  URL.revokeObjectURL(url);
}

async function descargarPDF(dias: number, rutas: RutaInsight[], act: Actividad) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF();
  const finalY = () => (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 30;

  doc.setFontSize(18); doc.setTextColor(27, 59, 111);
  doc.text("TransPadilla", 14, 18);
  doc.setFontSize(10); doc.setTextColor(107, 114, 128);
  doc.text("Moviendo la Ciudad — Resumen ejecutivo", 14, 24);
  doc.text(`Periodo: últimos ${dias} días   ·   Generado: ${hoyISO()}`, 14, 30);

  autoTable(doc, {
    startY: 38,
    head: [["Ruta", "Seguidores", "% Lleno", "Km", "Buses", "Operó"]],
    body: rutas.map((r) => [r.nombre, String(r.seguidores), `${pctLleno(r)}%`, String(r.km), String(r.buses), r.opero ? "Sí" : "No"]),
    headStyles: { fillColor: [27, 59, 111] }, styles: { fontSize: 9 },
  });

  const pico = [...act.horas].sort((a, b) => b.muestras - a.muestras)[0];
  const diaTop = [...act.dias_semana].sort((a, b) => b.muestras - a.muestras)[0];
  autoTable(doc, {
    startY: finalY() + 8,
    head: [["Indicador de actividad", "Valor"]],
    body: [
      ["Hora pico", pico && pico.muestras > 0 ? fmtHora(pico.h) : "—"],
      ["Día más movido", diaTop && diaTop.muestras > 0 ? (DOW[diaTop.dow] ?? "—") : "—"],
    ],
    headStyles: { fillColor: [27, 59, 111] }, styles: { fontSize: 9 },
  });

  doc.save(`resumen-transpadilla-${hoyISO()}.pdf`);
}

/** Encabezado de sección con barra dorada. */
function SecTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h3 className="font-display text-[13px] font-extrabold uppercase tracking-wide mb-2.5 flex items-center gap-2.5" style={{ color: "var(--color-navy, #1B3B6F)" }}>
      <span aria-hidden className="inline-block w-1 h-4 rounded-full" style={{ background: "var(--color-gold, #F5B731)" }} />
      <span className="inline-flex items-center gap-1.5">{icon}{children}</span>
    </h3>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl p-5 shadow-sm" style={{ background: "#fff", border: "1px solid #e5e7eb" }}>{children}</div>;
}

type OrdenKey = "seguidores" | "lleno" | "km" | "buses";

/**
 * Tab "Resumen ejecutivo": insights de negocio para la empresa.
 *  - Ruta más solicitada (por favoritos), hora pico, día más movido,
 *    ocupación por ruta y ranking comparativo. Exporta a PDF/CSV.
 */
export default function ResumenEjecutivoTab() {
  const [dias, setDias] = useState<number>(7);
  const [orden, setOrden] = useState<{ key: OrdenKey; dir: 1 | -1 }>({ key: "seguidores", dir: -1 });

  const rutasQ = useQuery({ queryKey: ["insights-rutas", dias], queryFn: () => getJson<RutasInsights>(`/api/reportes/rutas?dias=${dias}`) });
  const actQ = useQuery({ queryKey: ["insights-actividad", dias], queryFn: () => getJson<Actividad>(`/api/reportes/actividad?dias=${dias}`) });

  const cargando = rutasQ.isLoading || actQ.isLoading;
  const rutas = rutasQ.data?.rutas ?? [];
  const act = actQ.data;

  const topSolicitadas = [...rutas].filter((r) => r.seguidores > 0).sort((a, b) => b.seguidores - a.seguidores).slice(0, 3);
  const hayActividad = !!act && act.horas.some((h) => h.muestras > 0);
  const rutasConOcup = rutas.filter((r) => r.vacio + r.medio + r.lleno > 0);

  const valorOrden = (r: RutaInsight, k: OrdenKey) => k === "lleno" ? pctLleno(r) : r[k];
  const rutasOrdenadas = [...rutas].sort((a, b) => (valorOrden(a, orden.key) - valorOrden(b, orden.key)) * orden.dir);
  const cambiarOrden = (key: OrdenKey) => setOrden((o) => o.key === key ? { key, dir: (o.dir === 1 ? -1 : 1) } : { key, dir: -1 });

  const horaPico = act ? [...act.horas].sort((a, b) => b.muestras - a.muestras)[0] : undefined;
  const diaTop = act ? [...act.dias_semana].sort((a, b) => b.muestras - a.muestras)[0] : undefined;

  const puedeExportar = !cargando && !!act && rutas.length > 0;
  const sinNada = !cargando && rutas.length === 0;

  return (
    <div className="space-y-5">
      {/* Selector de periodo + exportar */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-muted-foreground">Periodo:</span>
        {RANGOS.map((r) => (
          <button
            key={r.dias}
            onClick={() => setDias(r.dias)}
            className="tp-press px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
            style={dias === r.dias
              ? { background: "var(--color-blue, #2558A5)", color: "#fff" }
              : { background: "var(--color-secondary, #eef2f7)", color: "var(--color-navy, #1B3B6F)" }}
          >
            {r.label}
          </button>
        ))}
        {puedeExportar && (
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => descargarCSV(dias, rutasOrdenadas, act)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors" style={{ background: "var(--color-secondary, #eef2f7)", color: "var(--color-navy, #1B3B6F)" }} aria-label="Exportar a CSV">
              <FileDown className="w-3.5 h-3.5" /> CSV
            </button>
            <button onClick={() => { void descargarPDF(dias, rutasOrdenadas, act); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-colors" style={{ background: "var(--color-blue, #2558A5)" }} aria-label="Exportar a PDF">
              <FileText className="w-3.5 h-3.5" /> PDF
            </button>
          </div>
        )}
      </div>

      {cargando ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando insights…
        </div>
      ) : sinNada ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <BarChart3 className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm font-bold text-foreground">Aún no hay rutas para analizar</p>
          <p className="text-xs text-muted-foreground mt-1">Crea rutas y deja que los buses circulen; aquí verás qué rutas se piden más, las horas pico y el ranking.</p>
        </div>
      ) : (
        <>
          {/* 1) Ruta más solicitada (podio por favoritos) */}
          <div>
            <SecTitle icon={<Star className="w-4 h-4" />}>Ruta más solicitada</SecTitle>
            {topSolicitadas.length === 0 ? (
              <Card>
                <p className="text-sm font-bold" style={{ color: "var(--color-navy, #1B3B6F)" }}>Aún nadie ha marcado rutas favoritas</p>
                <p className="text-xs mt-1" style={{ color: "var(--color-gray-text, #6B7280)" }}>Cuando los pasajeros marquen rutas con la estrella en el mapa, aquí verás las más populares.</p>
              </Card>
            ) : (
              <div className="tp-stagger grid grid-cols-1 sm:grid-cols-3 gap-3">
                {topSolicitadas.map((r, i) => (
                  <div key={r.ruta_id} className="tp-interactive rounded-2xl p-4 shadow-sm relative overflow-hidden" style={{ background: "#fff", border: "1px solid #e5e7eb" }}>
                    <span className="absolute left-0 top-0 bottom-0 w-1.5" style={{ background: r.color }} />
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-8 h-8 rounded-full flex items-center justify-center font-black text-white shadow-sm" style={{ background: MEDALLA[i] ?? "#9ca3af" }}>{i + 1}</span>
                      {i === 0 && <Trophy className="w-4 h-4" style={{ color: MEDALLA[0] }} />}
                      <span className="font-display font-bold text-sm truncate" style={{ color: "var(--color-navy, #1B3B6F)" }}>{r.nombre}</span>
                    </div>
                    <p className="text-3xl font-black leading-none" style={{ color: "var(--color-navy, #1B3B6F)" }}>
                      {r.seguidores} <span className="text-sm font-bold" style={{ color: "var(--color-gray-text, #6B7280)" }}>{r.seguidores === 1 ? "seguidor" : "seguidores"}</span>
                    </p>
                    {r.vacio + r.medio + r.lleno > 0 && (
                      <p className="text-[11px] mt-1.5" style={{ color: "var(--color-gray-text, #6B7280)" }}>Va llena el <b>{pctLleno(r)}%</b> del tiempo</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 2) Hora pico + 3) Día más movido */}
          <div className="lg:grid lg:grid-cols-2 lg:gap-5 space-y-5 lg:space-y-0">
            <Card>
              <SecTitle icon={<Clock className="w-4 h-4" />}>Hora pico del servicio</SecTitle>
              {!hayActividad ? (
                <p className="text-xs text-muted-foreground py-8 text-center">Sin actividad registrada en el periodo.</p>
              ) : (
                <>
                  <p className="text-xs mb-2" style={{ color: "var(--color-gray-text, #6B7280)" }}>
                    Mayor circulación de buses: <b style={{ color: "var(--color-navy, #1B3B6F)" }}>{horaPico ? fmtHora(horaPico.h) : "—"}</b>
                  </p>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={act!.horas} margin={{ left: -18, right: 8 }}>
                      <CartesianGrid vertical={false} stroke="#eef2f7" />
                      <XAxis dataKey="h" tick={{ fontSize: 9, fill: "#6B7280" }} interval={1} tickFormatter={(h: number) => String(h)} />
                      <YAxis tick={{ fontSize: 10, fill: "#6B7280" }} allowDecimals={false} />
                      <Tooltip labelFormatter={(h: number) => fmtHora(h)} formatter={(v: number) => [v, "Muestras"]} cursor={{ fill: "rgba(37,88,165,0.06)" }} />
                      <Bar dataKey="muestras" radius={[4, 4, 0, 0]}>
                        {act!.horas.map((x) => <Cell key={x.h} fill={horaPico && x.h === horaPico.h ? "#F5B731" : "#2558A5"} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </>
              )}
            </Card>

            <Card>
              <SecTitle icon={<CalendarDays className="w-4 h-4" />}>Día más movido</SecTitle>
              {!hayActividad ? (
                <p className="text-xs text-muted-foreground py-8 text-center">Sin actividad registrada en el periodo.</p>
              ) : (
                <>
                  <p className="text-xs mb-2" style={{ color: "var(--color-gray-text, #6B7280)" }}>
                    Día con más circulación: <b style={{ color: "var(--color-navy, #1B3B6F)" }}>{diaTop && diaTop.muestras > 0 ? DOW[diaTop.dow] : "—"}</b>
                  </p>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={act!.dias_semana} margin={{ left: -18, right: 8 }}>
                      <CartesianGrid vertical={false} stroke="#eef2f7" />
                      <XAxis dataKey="dow" tick={{ fontSize: 11, fill: "#6B7280" }} tickFormatter={(d: number) => DOW[d] ?? String(d)} />
                      <YAxis tick={{ fontSize: 10, fill: "#6B7280" }} allowDecimals={false} />
                      <Tooltip labelFormatter={(d: number) => DOW[d] ?? String(d)} formatter={(v: number) => [v, "Muestras"]} cursor={{ fill: "rgba(37,88,165,0.06)" }} />
                      <Bar dataKey="muestras" radius={[4, 4, 0, 0]}>
                        {act!.dias_semana.map((x) => <Cell key={x.dow} fill={diaTop && x.dow === diaTop.dow ? "#F5B731" : "#2558A5"} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </>
              )}
            </Card>
          </div>

          {/* 4) Ocupación por ruta */}
          <Card>
            <SecTitle icon={<Users2 className="w-4 h-4" />}>Ocupación por ruta</SecTitle>
            {rutasConOcup.length === 0 ? (
              <p className="text-xs text-muted-foreground py-8 text-center">Sin reportes de ocupación en el periodo. Los conductores la reportan (vacío/medio/lleno) durante el recorrido.</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(160, rutasConOcup.length * 46)}>
                <BarChart data={rutasConOcup} layout="vertical" margin={{ left: 8, right: 16 }} stackOffset="expand">
                  <CartesianGrid horizontal={false} stroke="#eef2f7" />
                  <XAxis type="number" tickFormatter={(v: number) => `${Math.round(v * 100)}%`} tick={{ fontSize: 10, fill: "#6B7280" }} />
                  <YAxis type="category" dataKey="nombre" width={120} tick={{ fontSize: 11, fill: "#1B3B6F" }} />
                  <Tooltip formatter={(v: number, n: string) => [v, n]} cursor={{ fill: "rgba(37,88,165,0.06)" }} />
                  <Bar dataKey="vacio" stackId="o" fill="#38A169" name="Vacío" radius={[6, 0, 0, 6]} />
                  <Bar dataKey="medio" stackId="o" fill="#F5B731" name="Medio" />
                  <Bar dataKey="lleno" stackId="o" fill="#E53E3E" name="Lleno" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          {/* 5) Ranking de rutas */}
          <Card>
            <SecTitle icon={<RouteIcon className="w-4 h-4" />}>Ranking de rutas ({dias} días)</SecTitle>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left" style={{ color: "var(--color-gray-text, #6B7280)" }}>
                    <th className="py-2 pr-2 font-semibold text-xs">Ruta</th>
                    {([["seguidores", "Seguidores"], ["lleno", "% Lleno"], ["km", "Km"], ["buses", "Buses"]] as const).map(([k, label]) => (
                      <th key={k} className="py-2 px-2 font-semibold text-xs">
                        <button onClick={() => cambiarOrden(k)} className="inline-flex items-center gap-1 hover:text-foreground" style={orden.key === k ? { color: "var(--color-blue, #2558A5)" } : undefined}>
                          {label} <ArrowUpDown className="w-3 h-3" />
                        </button>
                      </th>
                    ))}
                    <th className="py-2 px-2 font-semibold text-xs">Operó</th>
                  </tr>
                </thead>
                <tbody>
                  {rutasOrdenadas.map((r) => (
                    <tr key={r.ruta_id} className="border-t" style={{ borderColor: "#f1f4f8" }}>
                      <td className="py-2.5 pr-2">
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: r.color }} />
                          <span className="font-semibold truncate" style={{ color: "var(--color-navy, #1B3B6F)" }}>{r.nombre}</span>
                        </span>
                      </td>
                      <td className="py-2.5 px-2 font-bold tabular-nums" style={{ color: "var(--color-navy, #1B3B6F)" }}>{r.seguidores}</td>
                      <td className="py-2.5 px-2 tabular-nums">{pctLleno(r)}%</td>
                      <td className="py-2.5 px-2 tabular-nums">{r.km}</td>
                      <td className="py-2.5 px-2 tabular-nums">{r.buses}</td>
                      <td className="py-2.5 px-2">
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={r.opero ? { background: "rgba(56,161,105,0.14)", color: "#38A169" } : { background: "rgba(107,114,128,0.12)", color: "#6B7280" }}>
                          {r.opero ? "Sí" : "No"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <p className="text-[11px] text-center" style={{ color: "var(--color-gray-text, #6B7280)" }}>
            "Seguidores" = pasajeros que marcaron la ruta como favorita. La actividad y ocupación se toman del historial de recorridos del periodo.
          </p>
        </>
      )}
    </div>
  );
}
