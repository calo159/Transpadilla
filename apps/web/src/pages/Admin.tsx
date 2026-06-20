import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  useGetRutas, useGetBuses, useGetStats, useGetTodasParadas,
  getGetRutasQueryKey, getGetBusesQueryKey, getGetTodasParadasQueryKey,
} from "@workspace/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { getUser, clearAuth, homeForRol } from "@/lib/auth";
import {
  Bus, LogOut, Map, MapPin, BarChart3,
  RefreshCw, Users, Route,
  Radio, TrafficCone, UserCheck,
} from "lucide-react";
import TraficoTab from "./TraficoTab";
import DashboardTab from "./admin/DashboardTab";
import RutasTab from "./admin/RutasTab";
import BusesTab from "./admin/BusesTab";
import ParadasTab from "./admin/ParadasTab";
import ConductoresTab from "./admin/ConductoresTab";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { LogoTP } from "@/components/LogoTP";
import { ConfirmDialog, type ConfirmOpts } from "@/components/ConfirmDialog";
import { PromptDialog, type PromptOpts } from "@/components/PromptDialog";

type Tab = "dashboard" | "rutas" | "buses" | "paradas" | "conductores" | "trafico";

export default function Admin() {
  const [, setLocation] = useLocation();
  const user = getUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("dashboard");

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
    { id: "rutas"       as Tab, label: "Rutas",       icon: <Route className="w-4 h-4" /> },
    { id: "buses"       as Tab, label: "Buses",       icon: <Bus className="w-4 h-4" /> },
    { id: "paradas"     as Tab, label: "Paradas",     icon: <MapPin className="w-4 h-4" /> },
    { id: "conductores" as Tab, label: "Conductores", icon: <UserCheck className="w-4 h-4" /> },
    { id: "trafico"     as Tab, label: "Tráfico",     icon: <TrafficCone className="w-4 h-4" /> },
  ];


  const tabTitle: Record<Tab, string> = {
    dashboard:   "Dashboard",
    rutas:       "Gestión de Rutas",
    buses:       "Gestión de Buses",
    paradas:     "Gestión de Paradas",
    conductores: "Conductores",
    trafico:     "Monitoreo de Tráfico",
  };

  // Evita que el panel admin se muestre (aunque sea un instante) a quien no es admin;
  // el useEffect de arriba ya lo está redirigiendo a su propia página.
  if (!user || user.rol !== "admin") return null;

  return (
    <div className="flex h-screen bg-background overflow-hidden">

      {/* ─── DESKTOP SIDEBAR ─────────────────────────────────────────────── */}
      <div className="hidden md:flex flex-col w-56 min-w-56 border-r border-border" style={{ background: "linear-gradient(180deg, hsl(225 65% 8%) 0%, hsl(225 65% 6%) 100%)" }}>
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-border">
          <LogoTP size={32} />
          <div>
            <p className="text-sm font-black tracking-wider text-foreground">
              Trans<span style={{ color: "var(--tp-sky)" }}>Padilla</span>
            </p>
            <p className="text-[10px] font-semibold" style={{ color: "var(--tp-yellow)" }}>Administración</p>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.slice(0, 5).map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              data-testid={`nav-${item.id}`}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                tab === item.id
                  ? "text-foreground bg-white/5 border-l-2"
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground border-l-2 border-transparent"
              }`}
              style={tab === item.id ? { borderLeftColor: "var(--tp-yellow)", paddingLeft: "10px" } : {}}
            >
              {item.icon}
              {item.label}
            </button>
          ))}

          {/* Separador visual */}
          <div className="h-px bg-border/50 mx-2 my-1" />

          {/* Ir al mapa — encima de Tráfico */}
          <button
            onClick={() => setLocation("/")}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-muted-foreground hover:bg-white/5 hover:text-foreground border-l-2 border-transparent"
          >
            <Map className="w-4 h-4" />
            Ir al mapa
          </button>

          {navItems.slice(5).map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              data-testid={`nav-${item.id}`}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                tab === item.id
                  ? "text-foreground bg-white/5 border-l-2"
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground border-l-2 border-transparent"
              }`}
              style={tab === item.id ? { borderLeftColor: "var(--tp-yellow)", paddingLeft: "10px" } : {}}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-border space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground px-2 py-0.5">
            <Users className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{user?.nombre ?? "Admin"}</span>
          </div>
          <Button
            variant="ghost" size="sm"
            className="w-full justify-start gap-2 text-muted-foreground hover:text-destructive h-8"
            onClick={() => { clearAuth(); setLocation("/"); }}
            data-testid="button-salir"
          >
            <LogOut className="w-3.5 h-3.5" />Cerrar sesión
          </Button>
        </div>
      </div>

      {/* ─── MAIN AREA ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* ── MOBILE HEADER ── */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border shrink-0" style={{ background: "hsl(225 65% 8%)" }}>
          <div className="flex items-center gap-2.5">
            <LogoTP size={32} />
            <div>
              <p className="text-sm font-black tracking-wider text-foreground">
                Trans<span style={{ color: "var(--tp-sky)" }}>Padilla</span>
              </p>
              <p className="text-[10px] font-semibold" style={{ color: "var(--tp-yellow)" }}>Administración</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setLocation("/")} className="p-2 text-muted-foreground hover:text-foreground" title="Ir al mapa">
              <Map className="w-4.5 h-4.5" style={{ width: "18px", height: "18px" }} />
            </button>
            <button onClick={() => { clearAuth(); setLocation("/"); }} className="p-2 text-muted-foreground hover:text-destructive" data-testid="button-salir" title="Cerrar sesión">
              <LogOut className="w-4.5 h-4.5" style={{ width: "18px", height: "18px" }} />
            </button>
          </div>
        </div>

        {/* ── MOBILE TABS ── */}
        <div className="md:hidden flex border-b border-border shrink-0 overflow-x-auto" style={{ background: "hsl(225 65% 7%)", WebkitOverflowScrolling: "touch" }}>
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              data-testid={`nav-${item.id}`}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors flex-shrink-0 ${
                tab === item.id
                  ? "text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              style={tab === item.id ? { borderBottomColor: "var(--tp-yellow)" } : {}}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>

        {/* ── DESKTOP TOPBAR ── */}
        <div className="hidden md:flex items-center justify-between px-6 py-3 border-b border-border shrink-0" style={{ background: "hsl(225 65% 8% / 0.6)" }}>
          <div>
            <h1 className="text-lg font-bold text-foreground">{tabTitle[tab]}</h1>
            <p className="text-xs text-muted-foreground">Riohacha, La Guajira · TransPadilla</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-card border border-border rounded-lg px-3 py-1.5">
              <Radio className="w-3 h-3 text-green-400" /><span>Sistema en vivo</span>
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
        <div className="flex-1 overflow-y-auto p-4 md:p-6">

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

          {tab === "trafico" && <TraficoTab />}
        </div>
      </div>

      {/* Diálogos in-app (confirmar / renombrar) */}
      <ConfirmDialog opts={confirmar} onClose={() => setConfirmar(null)} />
      <PromptDialog opts={renombrar} onClose={() => setRenombrar(null)} />
    </div>
  );
}
