import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  useGetRutas, useGetBuses, useGetStats, useGetTodasParadas,
  getGetRutasQueryKey, getGetBusesQueryKey, getGetTodasParadasQueryKey,
} from "@workspace/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { getUser, cerrarSesion, homeForRol } from "@/lib/auth";
import {
  Bus, LogOut, Map, MapPin, BarChart3,
  RefreshCw, Users, Route,
  UserCheck, KeyRound, TrendingUp,
  Search, Bell, HelpCircle,
} from "lucide-react";
import DashboardTab from "./admin/DashboardTab";
import RutasTab from "./admin/RutasTab";
import BusesTab from "./admin/BusesTab";
import ParadasTab from "./admin/ParadasTab";
import ConductoresTab from "./admin/ConductoresTab";
import ResumenEjecutivoTab from "./admin/ResumenEjecutivoTab";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { LogoTP } from "@/components/LogoTP";
import { ConfirmDialog, type ConfirmOpts } from "@/components/ConfirmDialog";
import { PromptDialog, type PromptOpts } from "@/components/PromptDialog";
import { CambiarPasswordDialog } from "@/components/CambiarPasswordDialog";
import { useDocumentTitle } from "@/hooks/use-document-title";

type Tab = "dashboard" | "ejecutivo" | "rutas" | "buses" | "paradas" | "conductores";

export default function Admin() {
  useDocumentTitle("Panel admin · TransPadilla");
  const [, setLocation] = useLocation();
  const user = getUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [cambiarPass, setCambiarPass] = useState(false);

  // Guard de rol: solo un admin puede ver este panel. Cualquier otro usuario es
  // enviado a su propia página (conductor → /conductor, pasajero → /).
  useEffect(() => {
    if (!user) { setLocation("/login"); return; }
    if (user.rol !== "admin") setLocation(homeForRol(user.rol));
  }, [user, setLocation]);

  // Diálogos in-app (reemplazan a window.confirm / window.prompt); los tabs los
  // abren a través de setConfirmar / setRenombrar.
  const [confirmar, setConfirmar] = useState<ConfirmOpts | null>(null);
  const [renombrar, setRenombrar] = useState<PromptOpts | null>(null);

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useGetStats({
    query: { queryKey: ["stats"], refetchInterval: 15000 },
  });
  const { data: rutas = [], isLoading: rutasLoading } = useGetRutas({
    query: { queryKey: getGetRutasQueryKey(), refetchInterval: 20000 },
  });
  const { data: buses = [], isLoading: busesLoading } = useGetBuses({
    query: { queryKey: getGetBusesQueryKey(), refetchInterval: 10000 },
  });
  const { data: paradas = [] } = useGetTodasParadas({
    query: { queryKey: getGetTodasParadasQueryKey() },
  });


  const navItems = [
    { id: "dashboard"   as Tab, label: "Dashboard",   icon: <BarChart3 className="w-4 h-4" /> },
    { id: "ejecutivo"   as Tab, label: "Resumen ejecutivo", icon: <TrendingUp className="w-4 h-4" /> },
    { id: "rutas"       as Tab, label: "Rutas",       icon: <Route className="w-4 h-4" /> },
    { id: "buses"       as Tab, label: "Buses",       icon: <Bus className="w-4 h-4" /> },
    { id: "paradas"     as Tab, label: "Paradas",     icon: <MapPin className="w-4 h-4" /> },
    { id: "conductores" as Tab, label: "Conductores", icon: <UserCheck className="w-4 h-4" /> },
  ];


  const tabTitle: Record<Tab, string> = {
    dashboard:   "Dashboard",
    ejecutivo:   "Resumen Ejecutivo",
    rutas:       "Gestión de Rutas",
    buses:       "Gestión de Buses",
    paradas:     "Gestión de Paradas",
    conductores: "Conductores",
  };

  // Evita que el panel admin se muestre (aunque sea un instante) a quien no es admin;
  // el useEffect de arriba ya lo está redirigiendo a su propia página.
  if (!user || user.rol !== "admin") return null;

  return (
    <div className="tp-light tp-admin-bg flex h-screen overflow-hidden">

      {/* ─── DESKTOP SIDEBAR — stitch-style 280px ──────────────────────── */}
      <div className="hidden md:flex flex-col w-[280px] min-w-[280px] text-white" style={{ background: "linear-gradient(180deg, #1B3B6F, #142d55)" }}>
        <div className="flex flex-col items-center px-6 py-8">
          <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center mb-4">
            <Users className="w-8 h-8 text-white/80" />
          </div>
          <h1 className="font-display text-lg font-extrabold tracking-wide text-white">TRANSPADILLA</h1>
          <p className="text-[11px] font-medium text-white/60">Administración · Riohacha</p>
        </div>

        <nav className="flex-1 px-3 space-y-1">
          {navItems.map((item) => {
            const a = tab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                data-testid={`nav-${item.id}`}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all active:scale-[0.98]"
                style={a ? { background: "var(--color-gold)", color: "var(--color-navy)" } : { color: "rgba(255,255,255,0.75)" }}
              >
                <span className={a ? "" : "opacity-60"}>{item.icon}</span>
                {item.label}
              </button>
            );
          })}
          <button
            onClick={() => setLocation("/")}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-colors text-white/60 hover:text-white"
          >
            <Map className="w-4 h-4 opacity-60" />
            Ir al mapa
          </button>
        </nav>

        <div className="p-4">
          <button onClick={() => setTab("rutas")} className="w-full flex items-center justify-center gap-2 h-11 rounded-xl font-bold mb-3 active:scale-[0.98] shadow-sm" style={{ background: "var(--color-gold)", color: "var(--color-navy)" }}>
            <Route className="w-4 h-4" /> Nueva ruta
          </button>
          <div className="flex items-center gap-2.5 rounded-xl p-3" style={{ background: "rgba(255,255,255,0.06)" }}>
            <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "var(--color-gold)" }}>
              <Users className="w-4 h-4" style={{ color: "var(--color-navy)" }} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate">{user?.nombre ?? "Admin"}</p>
              <button onClick={() => setCambiarPass(true)} className="text-[10px] text-white/60 hover:text-white">Cambiar contraseña</button>
            </div>
            <button onClick={() => { void cerrarSesion().finally(() => setLocation("/")); }} data-testid="button-salir" className="p-1.5 text-white/60 hover:text-white flex-shrink-0" aria-label="Cerrar sesión" title="Cerrar sesión"><LogOut className="w-4 h-4" /></button>
          </div>
        </div>
      </div>

      {/* ─── MAIN AREA ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* ── MOBILE HEADER (navy) ── */}
        <div className="md:hidden flex items-center justify-between px-4 shrink-0 text-white" style={{ background: "var(--color-navy)", height: 56 }}>
          <span className="font-display font-extrabold text-xl tracking-wide text-white">TRANSPADILLA</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setLocation("/")} className="p-2 text-white" title="Ir al mapa" aria-label="Ir al mapa"><Map style={{ width: 18, height: 18 }} /></button>
            <button onClick={() => setCambiarPass(true)} className="p-2 text-white" title="Cambiar contraseña" aria-label="Cambiar contraseña"><KeyRound style={{ width: 18, height: 18 }} /></button>
            <button onClick={() => { void cerrarSesion().finally(() => setLocation("/")); }} className="p-2 text-white" data-testid="button-salir" title="Cerrar sesión" aria-label="Cerrar sesión"><LogOut style={{ width: 18, height: 18 }} /></button>
          </div>
        </div>

        {/* ── MOBILE TABS (navy) ── */}
        <div className="md:hidden flex shrink-0 overflow-x-auto text-white" style={{ background: "var(--color-navy)", WebkitOverflowScrolling: "touch" }}>
          {navItems.map((item) => {
            const a = tab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                data-testid={`nav-${item.id}`}
                className="flex items-center gap-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap border-b-2 flex-shrink-0"
                style={a ? { borderBottomColor: "var(--color-gold)", color: "#fff" } : { borderBottomColor: "transparent", color: "rgba(255,255,255,0.6)" }}
              >
                {item.icon}
                {item.label}
              </button>
            );
          })}
        </div>

        {/* ── DESKTOP TOPBAR — stitch-style ── */}
        <div className="hidden md:flex items-center justify-between px-8 py-3 shrink-0 bg-white border-b sticky top-0 z-10" style={{ borderColor: "#e8edf4", height: 64 }}>
          <div className="flex items-center gap-4">
            <h1 className="font-display text-xl font-extrabold" style={{ color: "var(--color-navy)" }}>{tabTitle[tab]}</h1>
            <span className="h-6 w-px" style={{ background: "#e8edf4" }} />
            <div className="flex items-center text-xs" style={{ color: "var(--color-gray-text)" }}>
              <span>Riohacha · {new Date().toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--color-gray-text)" }} />
              <input
                type="text"
                placeholder="Buscar..."
                className="w-56 h-9 rounded-lg text-sm border pl-9 pr-3 bg-transparent focus:outline-none focus:ring-2 transition-all"
                style={{ borderColor: "#e8edf4", color: "var(--color-navy)" }}
              />
            </div>
            <button className="p-2 rounded-full relative hover:bg-gray-50 transition-colors" style={{ color: "var(--color-gray-text)" }} aria-label="Notificaciones">
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full border-2 border-white" style={{ background: "var(--color-danger)" }} />
            </button>
            <button className="p-2 rounded-full hover:bg-gray-50 transition-colors" style={{ color: "var(--color-gray-text)" }} aria-label="Ayuda">
              <HelpCircle className="w-4 h-4" />
            </button>
            <div role="status" aria-live="polite" className="flex items-center gap-2 text-xs font-bold rounded-full px-3 py-1.5" style={{ background: "rgba(56,161,105,0.12)", color: "var(--color-success)" }}>
              <span className="tp-livedot" style={{ width: 6, height: 6, background: "var(--color-success)" }} aria-hidden="true" /><span>EN VIVO</span>
            </div>
            <Button
              variant="outline" size="sm"
              onClick={() => { queryClient.invalidateQueries(); refetchStats(); toast({ title: "Datos actualizados" }); }}
              className="h-8"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Actualizar
            </Button>
          </div>
        </div>

        {/* ── CONTENT ── */}
        {/* En pantallas anchas el contenido se centra y limita para leerse como un
            panel real (no estirado de borde a borde); en móvil sigue full-width. */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
         <div key={tab} className="tp-enter mx-auto w-full md:max-w-6xl">

          {/* DASHBOARD */}
          {tab === "dashboard" && (
            <DashboardTab
              stats={stats}
              statsLoading={statsLoading}
              buses={buses}
              busesLoading={busesLoading}
              rutas={rutas}
              rutasLoading={rutasLoading}
            />
          )}

          {/* RUTAS */}
          {tab === "rutas" && (
            <RutasTab
              rutas={rutas}
              rutasLoading={rutasLoading}
              setConfirmar={setConfirmar}
              setRenombrar={setRenombrar}
            />
          )}

          {/* BUSES */}
          {tab === "buses" && (
            <BusesTab
              buses={buses}
              busesLoading={busesLoading}
              rutas={rutas}
              setConfirmar={setConfirmar}
            />
          )}

          {/* PARADAS */}
          {tab === "paradas" && (
            <ParadasTab
              rutas={rutas}
              paradas={paradas}
              setConfirmar={setConfirmar}
              setRenombrar={setRenombrar}
            />
          )}

          {/* CONDUCTORES */}
          {tab === "conductores" && (
            <ConductoresTab buses={buses} setConfirmar={setConfirmar} />
          )}

          {/* RESUMEN EJECUTIVO (KPIs + km por ruta + ocupación + descarga PDF/CSV) */}
          {tab === "ejecutivo" && <ResumenEjecutivoTab />}

         </div>
        </div>
      </div>

      {/* Diálogos in-app (confirmar / renombrar) */}
      <ConfirmDialog opts={confirmar} onClose={() => setConfirmar(null)} />
      <PromptDialog opts={renombrar} onClose={() => setRenombrar(null)} />
      <CambiarPasswordDialog open={cambiarPass} onClose={() => setCambiarPass(false)} />
    </div>
  );
}
