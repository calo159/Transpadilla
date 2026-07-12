import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  useGetRutas, useGetBuses, useGetStats, useGetTodasParadas,
  getGetRutasQueryKey, getGetBusesQueryKey, getGetTodasParadasQueryKey,
} from "@workspace/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { getUser, cerrarSesion, homeForRol } from "@/lib/auth";
import {
  Bus, LogOut, Map, MapPin, MapPinned, BarChart3,
  RefreshCw, Users, Route,
  UserCheck, KeyRound, TrendingUp, Megaphone,
} from "lucide-react";
import DashboardTab from "./admin/DashboardTab";
import RutasTab from "./admin/RutasTab";
import BusesTab from "./admin/BusesTab";
import ParadasTab from "./admin/ParadasTab";
import ConductoresTab from "./admin/ConductoresTab";
import ResumenEjecutivoTab from "./admin/ResumenEjecutivoTab";
import BannersTab from "./admin/BannersTab";
import LugaresTab from "./admin/LugaresTab";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { LogoTP } from "@/components/LogoTP";
import { ConfirmDialog, type ConfirmOpts } from "@/components/ConfirmDialog";
import { PromptDialog, type PromptOpts } from "@/components/PromptDialog";
import { CambiarPasswordDialog } from "@/components/CambiarPasswordDialog";
import { useDocumentTitle } from "@/hooks/use-document-title";

type Tab = "dashboard" | "ejecutivo" | "rutas" | "buses" | "paradas" | "lugares" | "conductores" | "anuncios";

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
    { id: "lugares"     as Tab, label: "Lugares",     icon: <MapPinned className="w-4 h-4" /> },
    { id: "conductores" as Tab, label: "Conductores", icon: <UserCheck className="w-4 h-4" /> },
    { id: "anuncios"    as Tab, label: "Anuncios",    icon: <Megaphone className="w-4 h-4" /> },
  ];


  const tabTitle: Record<Tab, string> = {
    dashboard:   "Dashboard",
    ejecutivo:   "Resumen Ejecutivo",
    rutas:       "Gestión de Rutas",
    buses:       "Gestión de Buses",
    paradas:     "Gestión de Paradas",
    lugares:     "Lugares / Puntos de Interés",
    conductores: "Conductores",
    anuncios:    "Anuncios a Pantalla Completa",
  };

  // Evita que el panel admin se muestre (aunque sea un instante) a quien no es admin;
  // el useEffect de arriba ya lo está redirigiendo a su propia página.
  if (!user || user.rol !== "admin") return null;

  return (
    <div className="tp-light tp-admin-bg flex h-screen overflow-hidden">

      {/* ─── DESKTOP SIDEBAR (navy, estilo Stitch) ───────────────────────── */}
      <div className="hidden md:flex flex-col w-60 min-w-60 text-white" style={{ background: "linear-gradient(180deg, #1B3B6F, #16305c)" }}>
        <div className="flex items-center gap-2.5 px-5 py-5">
          <LogoTP size={34} />
          <div>
            <p className="font-display text-lg font-extrabold tracking-wide text-white">TRANSPADILLA</p>
            <p className="text-[10px] font-semibold text-white/60">Administración · Riohacha</p>
          </div>
        </div>

        <nav className="flex-1 px-3 space-y-1">
          {navItems.map((item) => {
            const a = tab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                data-testid={`nav-${item.id}`}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors active:scale-[0.98]"
                style={a ? { background: "var(--color-gold)", color: "var(--color-navy)" } : { color: "rgba(255,255,255,0.8)" }}
              >
                {item.icon}
                {item.label}
              </button>
            );
          })}
          <button
            onClick={() => setLocation("/")}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors text-white/80 hover:text-white"
          >
            <Map className="w-4 h-4" />
            Ir al mapa
          </button>
        </nav>

        <div className="p-3">
          <button onClick={() => setTab("rutas")} className="w-full flex items-center justify-center gap-2 h-11 rounded-xl font-bold mb-3 active:scale-[0.98]" style={{ background: "var(--color-blue)", color: "#fff" }}>
            <Route className="w-4 h-4" /> Nueva ruta
          </button>
          {/* Tarjeta de usuario (estilo mockup): avatar dorado + nombre + acciones */}
          <div className="flex items-center gap-2.5 rounded-xl p-2.5" style={{ background: "rgba(255,255,255,0.06)" }}>
            <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "var(--color-gold)" }}>
              <Users className="w-4 h-4" style={{ color: "var(--color-navy)" }} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-white truncate">{user?.nombre ?? "Admin"}</p>
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

        {/* ── DESKTOP TOPBAR (claro) ── */}
        <div className="hidden md:flex items-center justify-between px-6 py-3 shrink-0 bg-white border-b md:sticky md:top-0 md:z-10" style={{ borderColor: "#e8edf4" }}>
          <div className="flex items-center gap-3">
            <span aria-hidden className="w-1 h-9 rounded-full" style={{ background: "var(--color-gold)" }} />
            <div>
              <h1 className="font-display text-xl font-extrabold" style={{ color: "var(--color-navy)" }}>{tabTitle[tab]}</h1>
              <p className="text-xs" style={{ color: "var(--color-gray-text)" }}>Riohacha, La Guajira · TransPadilla</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
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

          {/* LUGARES (puntos de interés para la búsqueda de destino del pasajero) */}
          {tab === "lugares" && <LugaresTab setConfirmar={setConfirmar} setRenombrar={setRenombrar} />}

          {/* ANUNCIOS (banners a pantalla completa para el pasajero) */}
          {tab === "anuncios" && <BannersTab setConfirmar={setConfirmar} />}

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
