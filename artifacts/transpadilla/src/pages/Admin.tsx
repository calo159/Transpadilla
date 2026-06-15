import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  useGetRutas, useGetBuses, useGetStats, useGetTodasParadas,
  useCreateRuta, useDeleteRuta, useCreateBus, useDeleteBus,
  useCrearParada, useAsignarParada, useDeleteParada,
  getGetRutasQueryKey, getGetBusesQueryKey, getGetTodasParadasQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getUser, clearAuth, getToken, homeForRol } from "@/lib/auth";
import {
  Bus, LogOut, Map, MapPin, BarChart3, Plus, Trash2,
  RefreshCw, Users, Activity, AlertTriangle, Route,
  Clock, Radio, TrafficCone, ChevronLeft, UserCheck, Eye, EyeOff,
} from "lucide-react";
import TraficoTab from "./TraficoTab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { LogoTP } from "@/components/LogoTP";

type Tab = "dashboard" | "rutas" | "buses" | "paradas" | "conductores" | "trafico";

interface Conductor {
  id: number;
  nombre: string;
  correo: string;
  identificacion: string | null;
}

const COLORES = [
  { label: "Azul TransPadilla", value: "#1757C2" },
  { label: "Rojo",    value: "#e74c3c" },
  { label: "Verde",   value: "#2ecc71" },
  { label: "Naranja", value: "#f39c12" },
  { label: "Púrpura", value: "#9b59b6" },
  { label: "Cian",    value: "#1abc9c" },
  { label: "Rosa",    value: "#e91e63" },
  { label: "Amarillo TransPadilla", value: "#F5C200" },
];

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

  const [rutaNombre, setRutaNombre] = useState("");
  const [rutaColor, setRutaColor] = useState("#1757C2");
  const [busPlaca, setBusPlaca] = useState("");
  const [busRutaId, setBusRutaId] = useState<string>("");
  const [paradaNombre, setParadaNombre] = useState("");
  const [paradaLat, setParadaLat] = useState("");
  const [paradaLng, setParadaLng] = useState("");
  const [asignarRutaId, setAsignarRutaId] = useState<string>("");
  const [asignarParadaId, setAsignarParadaId] = useState<string>("");
  const [asignarOrden, setAsignarOrden] = useState("0");

  // Conductores
  const [conductores, setConductores] = useState<Conductor[]>([]);
  const [conductoresLoading, setConductoresLoading] = useState(false);
  const [condNombre, setCondNombre] = useState("");
  const [condIdentificacion, setCondIdentificacion] = useState("");
  const [condCorreo, setCondCorreo] = useState("");
  const [condPassword, setCondPassword] = useState("");
  const [condShowPass, setCondShowPass] = useState(false);
  const [condPending, setCondPending] = useState(false);

  const fetchConductores = useCallback(async () => {
    setConductoresLoading(true);
    try {
      const res = await fetch("/api/conductores", {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) setConductores(await res.json() as Conductor[]);
    } finally {
      setConductoresLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "conductores") fetchConductores();
  }, [tab, fetchConductores]);

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

  const createRuta = useCreateRuta();
  const deleteRuta = useDeleteRuta();
  const createBus = useCreateBus();
  const deleteBus = useDeleteBus();
  const crearParada = useCrearParada();
  const asignarParadaMutation = useAsignarParada();
  const deleteParada = useDeleteParada();

  const handleCreateRuta = async () => {
    if (!rutaNombre.trim()) { toast({ title: "El nombre de la ruta es obligatorio", variant: "destructive" }); return; }
    try {
      await createRuta.mutateAsync({ data: { nombre: rutaNombre.trim(), color: rutaColor } });
      queryClient.invalidateQueries({ queryKey: getGetRutasQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      setRutaNombre(""); setRutaColor("#1757C2");
      toast({ title: "Ruta creada exitosamente" });
    } catch {
      toast({ title: "Error al crear la ruta", variant: "destructive" });
    }
  };

  const handleDeleteRuta = async (id: number, nombre: string) => {
    if (!confirm(`¿Eliminar la ruta "${nombre}"? Esta acción no se puede deshacer.`)) return;
    try {
      await deleteRuta.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getGetRutasQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      toast({ title: `Ruta "${nombre}" eliminada` });
    } catch {
      toast({ title: "Error al eliminar la ruta", variant: "destructive" });
    }
  };

  const handleCreateBus = async () => {
    if (!busPlaca.trim()) { toast({ title: "La placa es obligatoria", variant: "destructive" }); return; }
    try {
      const ruta_id = (busRutaId && busRutaId !== "none") ? parseInt(busRutaId, 10) : null;
      await createBus.mutateAsync({ data: { placa: busPlaca.trim().toUpperCase(), ruta_id } });
      queryClient.invalidateQueries({ queryKey: getGetBusesQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      setBusPlaca(""); setBusRutaId("");
      toast({ title: "Bus registrado exitosamente" });
    } catch {
      toast({ title: "Error al registrar el bus", variant: "destructive" });
    }
  };

  const handleDeleteBus = async (id: number, placa: string) => {
    if (!confirm(`¿Eliminar el bus "${placa}"?`)) return;
    try {
      await deleteBus.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getGetBusesQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      toast({ title: `Bus "${placa}" eliminado` });
    } catch {
      toast({ title: "Error al eliminar el bus", variant: "destructive" });
    }
  };

  const handleCrearParada = async () => {
    if (!paradaNombre.trim() || !paradaLat || !paradaLng) { toast({ title: "Completa todos los campos", variant: "destructive" }); return; }
    const lat = parseFloat(paradaLat); const lng = parseFloat(paradaLng);
    if (isNaN(lat) || isNaN(lng)) { toast({ title: "Latitud y longitud deben ser números", variant: "destructive" }); return; }
    try {
      await crearParada.mutateAsync({ data: { nombre: paradaNombre.trim(), latitud: lat, longitud: lng } });
      queryClient.invalidateQueries({ queryKey: getGetTodasParadasQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      setParadaNombre(""); setParadaLat(""); setParadaLng("");
      toast({ title: "Parada creada" });
    } catch {
      toast({ title: "Error al crear la parada", variant: "destructive" });
    }
  };

  const handleAsignarParada = async () => {
    if (!asignarRutaId || !asignarParadaId) { toast({ title: "Selecciona ruta y parada", variant: "destructive" }); return; }
    try {
      await asignarParadaMutation.mutateAsync({ id: parseInt(asignarRutaId, 10), data: { parada_id: parseInt(asignarParadaId, 10), orden: parseInt(asignarOrden, 10) || 0 } });
      queryClient.invalidateQueries({ queryKey: getGetRutasQueryKey() });
      setAsignarParadaId(""); setAsignarOrden("0");
      toast({ title: "Parada asignada a la ruta" });
    } catch {
      toast({ title: "Error al asignar la parada", variant: "destructive" });
    }
  };

  const handleDeleteParada = async (id: number, nombre: string) => {
    if (!confirm(`¿Eliminar la parada "${nombre}"? Se quitará de todas las rutas.`)) return;
    try {
      await deleteParada.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getGetTodasParadasQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetRutasQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      toast({ title: `Parada "${nombre}" eliminada` });
    } catch {
      toast({ title: "Error al eliminar la parada", variant: "destructive" });
    }
  };

  const handleRegistrarConductor = async () => {
    if (!condNombre.trim() || !condIdentificacion.trim() || !condCorreo.trim() || !condPassword.trim()) {
      toast({ title: "Completa todos los campos", variant: "destructive" }); return;
    }
    setCondPending(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ nombre: condNombre.trim(), correo: condCorreo.trim(), password: condPassword, rol: "conductor", identificacion: condIdentificacion.trim() }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        toast({ title: err.error ?? "Error al registrar conductor", variant: "destructive" }); return;
      }
      toast({ title: `Conductor "${condNombre.trim()}" registrado` });
      setCondNombre(""); setCondIdentificacion(""); setCondCorreo(""); setCondPassword("");
      fetchConductores();
    } catch {
      toast({ title: "Error de conexión", variant: "destructive" });
    } finally {
      setCondPending(false);
    }
  };

  const handleDeleteConductor = async (id: number, nombre: string) => {
    if (!confirm(`¿Eliminar al conductor "${nombre}"? Perderá acceso al sistema.`)) return;
    try {
      const res = await fetch(`/api/conductores/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error();
      toast({ title: `Conductor "${nombre}" eliminado` });
      setConductores((prev) => prev.filter((c) => c.id !== id));
    } catch {
      toast({ title: "Error al eliminar conductor", variant: "destructive" });
    }
  };

  const handleAsignarBusConductor = async (conductorId: number, newBusId: number | null, prevBusId: number | null) => {
    const patch = async (busId: number, cId: number | null) => {
      const r = await fetch(`/api/buses/${busId}/conductor`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ conductor_id: cId }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `HTTP ${r.status}`);
      }
    };
    try {
      if (prevBusId && prevBusId !== newBusId) await patch(prevBusId, null);
      if (newBusId) await patch(newBusId, conductorId);
      await queryClient.invalidateQueries({ queryKey: getGetBusesQueryKey() });
      toast({ title: newBusId ? "Bus asignado al conductor" : "Bus desasignado" });
    } catch (err) {
      toast({ title: `Error al asignar bus: ${String(err)}`, variant: "destructive" });
    }
  };

  const navItems = [
    { id: "dashboard"   as Tab, label: "Dashboard",   icon: <BarChart3 className="w-4 h-4" /> },
    { id: "rutas"       as Tab, label: "Rutas",       icon: <Route className="w-4 h-4" /> },
    { id: "buses"       as Tab, label: "Buses",       icon: <Bus className="w-4 h-4" /> },
    { id: "paradas"     as Tab, label: "Paradas",     icon: <MapPin className="w-4 h-4" /> },
    { id: "conductores" as Tab, label: "Conductores", icon: <UserCheck className="w-4 h-4" /> },
    { id: "trafico"     as Tab, label: "Tráfico",     icon: <TrafficCone className="w-4 h-4" /> },
  ];

  const activeBuses   = buses.filter((b) => b.estado === "activo");
  const inactiveBuses = buses.filter((b) => b.estado === "inactivo");
  const demoraBuses   = buses.filter((b) => b.estado === "demora");

  const tabTitle: Record<Tab, string> = {
    dashboard:   "Dashboard",
    rutas:       "Gestión de Rutas",
    buses:       "Gestión de Buses",
    paradas:     "Gestión de Paradas",
    conductores: "Conductores",
    trafico:     "Monitoreo de Tráfico",
  };

  const inputCls = "bg-background border-border h-11 text-base rounded-xl md:h-9 md:text-sm md:rounded-lg";
  const selectTriggerCls = "bg-background border-border h-11 text-base rounded-xl md:h-9 md:text-sm md:rounded-lg";

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
            <div className="space-y-5">
              {statsLoading ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="bg-card border border-border rounded-xl p-4 animate-pulse">
                      <div className="h-3 bg-muted rounded mb-3 w-1/2" /><div className="h-7 bg-muted rounded" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                  {[
                    { label: "Total Buses",  value: stats?.totalBuses ?? 0,     icon: <Bus className="w-5 h-5 text-primary" />,        color: "text-primary" },
                    { label: "Activos",      value: stats?.busesActivos ?? 0,   icon: <Activity className="w-5 h-5 text-green-400" />, color: "text-green-400" },
                    { label: "Con Demora",   value: stats?.busesConDemora ?? 0, icon: <Clock className="w-5 h-5" style={{ color: "var(--tp-yellow)" }} />, color: "" },
                    { label: "Rutas",        value: stats?.totalRutas ?? 0,     icon: <Map className="w-5 h-5 text-purple-400" />,     color: "text-purple-400" },
                    { label: "Paradas",      value: stats?.totalParadas ?? 0,   icon: <MapPin className="w-5 h-5 text-sky-400" />,     color: "text-sky-400" },
                  ].map((stat, i) => (
                    <div key={stat.label} className="bg-card border border-border rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-muted-foreground leading-tight">{stat.label}</span>
                        {stat.icon}
                      </div>
                      <p className={`text-2xl md:text-3xl font-black ${stat.color}`} style={i === 2 ? { color: "var(--tp-yellow)" } : {}}>
                        {stat.value}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Estado de la flota */}
                <div className="bg-card border border-border rounded-xl p-4 md:p-5">
                  <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                    <Bus className="w-4 h-4 text-primary" /> Estado de la flota
                  </h3>
                  {busesLoading ? (
                    <div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="h-10 bg-muted/40 rounded-lg animate-pulse" />)}</div>
                  ) : buses.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No hay buses registrados</p>
                  ) : (
                    <div className="space-y-2">
                      {[
                        { label: "Activos",    items: activeBuses,   style: "border-green-500/20 bg-green-500/5 text-green-400" },
                        { label: "Con demora", items: demoraBuses,   style: "border-amber-500/20 bg-amber-500/5 text-amber-400" },
                        { label: "Inactivos",  items: inactiveBuses, style: "border-border bg-muted/5 text-muted-foreground" },
                      ].filter((g) => g.items.length > 0).map((group) => (
                        <div key={group.label} className={`border rounded-xl p-3 ${group.style}`}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold uppercase tracking-wider">{group.label}</span>
                            <span className="text-xl font-black">{group.items.length}</span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {group.items.map((b) => (
                              <span key={b.id} className="text-xs font-mono bg-black/20 px-2 py-0.5 rounded-md">{b.placa}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Rutas activas */}
                <div className="bg-card border border-border rounded-xl p-4 md:p-5">
                  <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                    <Route className="w-4 h-4 text-purple-400" /> Rutas activas
                  </h3>
                  {rutasLoading ? (
                    <div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="h-10 bg-muted/40 rounded-lg animate-pulse" />)}</div>
                  ) : rutas.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No hay rutas configuradas</p>
                  ) : (
                    <div className="space-y-2 max-h-56 overflow-y-auto">
                      {rutas.map((ruta) => {
                        const rb = buses.filter((b) => b.ruta_id === ruta.id);
                        return (
                          <div key={ruta.id} className="flex items-center gap-3 p-2.5 bg-secondary/30 rounded-xl">
                            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: ruta.color }} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{ruta.nombre}</p>
                              <p className="text-xs text-muted-foreground">{ruta.paradas.length} paradas{rb.length > 0 ? ` · ${rb.length} bus${rb.length !== 1 ? "es" : ""}` : ""}</p>
                            </div>
                            {rb.some((b) => b.estado === "activo") && (
                              <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-md font-bold flex-shrink-0">En línea</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Novedades activas */}
              {buses.filter((b) => b.novedad).length > 0 && (
                <div className="rounded-xl p-4 md:p-5 border" style={{ borderColor: "rgba(245,194,0,0.3)", background: "rgba(245,194,0,0.05)" }}>
                  <h3 className="text-sm font-semibold flex items-center gap-2 mb-3" style={{ color: "var(--tp-yellow)" }}>
                    <AlertTriangle className="w-4 h-4" /> Novedades activas
                  </h3>
                  <div className="space-y-2">
                    {buses.filter((b) => b.novedad).map((b) => (
                      <div key={b.id} className="flex items-start gap-2 text-sm">
                        <span className="font-mono font-bold flex-shrink-0" style={{ color: "var(--tp-yellow)" }}>{b.placa}</span>
                        <span className="text-foreground/80">{b.novedad}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* RUTAS */}
          {tab === "rutas" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="bg-card border border-border rounded-xl p-4 md:p-5 h-fit">
                <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Plus className="w-4 h-4 text-primary" /> Nueva ruta
                </h3>
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs mb-1.5">Nombre de la ruta</Label>
                    <Input value={rutaNombre} onChange={(e) => setRutaNombre(e.target.value)} placeholder="Ej: Ruta A — Centro a Marbella" className={inputCls} data-testid="input-ruta-nombre" />
                  </div>
                  <div>
                    <Label className="text-xs mb-1.5">Color en el mapa</Label>
                    <div className="flex flex-wrap gap-2.5 mt-1">
                      {COLORES.map((c) => (
                        <button
                          key={c.value}
                          onClick={() => setRutaColor(c.value)}
                          title={c.label}
                          className={`w-8 h-8 rounded-full border-2 transition-all active:scale-90 ${rutaColor === c.value ? "border-white scale-110 shadow-lg" : "border-transparent"}`}
                          style={{ background: c.value }}
                        />
                      ))}
                    </div>
                  </div>
                  <Button onClick={handleCreateRuta} disabled={createRuta.isPending} className="w-full h-11 rounded-xl" data-testid="button-crear-ruta">
                    <Plus className="w-4 h-4 mr-2" />{createRuta.isPending ? "Creando..." : "Crear ruta"}
                  </Button>
                </div>
              </div>

              <div className="bg-card border border-border rounded-xl p-4 md:p-5">
                <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center justify-between">
                  <span className="flex items-center gap-2"><Route className="w-4 h-4 text-purple-400" /> Rutas registradas</span>
                  <span className="text-xs text-muted-foreground font-normal">{rutas.length} en total</span>
                </h3>
                {rutasLoading ? (
                  <div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="h-12 bg-muted/40 rounded-xl animate-pulse" />)}</div>
                ) : rutas.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No hay rutas. Crea la primera.</p>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {rutas.map((ruta) => (
                      <div key={ruta.id} className="flex items-center gap-3 p-3 bg-secondary/30 border border-border rounded-xl">
                        <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: ruta.color }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{ruta.nombre}</p>
                          <p className="text-xs text-muted-foreground">{ruta.paradas.length} paradas</p>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => handleDeleteRuta(ruta.id, ruta.nombre)} className="h-9 w-9 p-0 text-muted-foreground hover:text-destructive" data-testid={`delete-ruta-${ruta.id}`}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* BUSES */}
          {tab === "buses" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="bg-card border border-border rounded-xl p-4 md:p-5 h-fit">
                <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Plus className="w-4 h-4 text-primary" /> Registrar bus
                </h3>
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs mb-1.5">Placa del vehículo</Label>
                    <Input value={busPlaca} onChange={(e) => setBusPlaca(e.target.value.toUpperCase())} placeholder="Ej: GUA-001" className={`${inputCls} font-mono`} data-testid="input-bus-placa" maxLength={10} />
                  </div>
                  <div>
                    <Label className="text-xs mb-1.5">Asignar a ruta (opcional)</Label>
                    <Select value={busRutaId} onValueChange={setBusRutaId}>
                      <SelectTrigger className={selectTriggerCls} data-testid="select-bus-ruta"><SelectValue placeholder="Sin ruta asignada" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin ruta</SelectItem>
                        {rutas.map((r) => <SelectItem key={r.id} value={r.id.toString()}>{r.nombre}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleCreateBus} disabled={createBus.isPending} className="w-full h-11 rounded-xl" data-testid="button-crear-bus">
                    <Plus className="w-4 h-4 mr-2" />{createBus.isPending ? "Registrando..." : "Registrar bus"}
                  </Button>
                </div>
              </div>

              <div className="bg-card border border-border rounded-xl p-4 md:p-5">
                <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center justify-between">
                  <span className="flex items-center gap-2"><Bus className="w-4 h-4 text-primary" /> Flota de buses</span>
                  <span className="text-xs text-muted-foreground font-normal">{buses.length} en total</span>
                </h3>
                {busesLoading ? (
                  <div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="h-16 bg-muted/40 rounded-xl animate-pulse" />)}</div>
                ) : buses.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No hay buses. Registra el primero.</p>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {buses.map((b) => (
                      <div key={b.id} className="flex items-start gap-3 p-3 bg-secondary/30 border border-border rounded-xl">
                        <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${b.estado === "activo" ? "bg-green-500" : b.estado === "demora" ? "bg-amber-500" : "bg-muted-foreground"}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-mono font-bold text-foreground">{b.placa}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold uppercase ${b.estado === "activo" ? "bg-green-500/20 text-green-400" : b.estado === "demora" ? "bg-amber-500/20 text-amber-400" : "bg-muted/20 text-muted-foreground"}`}>{b.estado}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{b.nombre_ruta ?? "Sin ruta"}{b.velocidad && b.velocidad > 0 ? ` · ${Math.round(b.velocidad)} km/h` : ""}</p>
                          {b.novedad && <p className="text-xs mt-0.5" style={{ color: "var(--tp-yellow)" }}>⚠ {b.novedad}</p>}
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => handleDeleteBus(b.id, b.placa)} className="h-9 w-9 p-0 text-muted-foreground hover:text-destructive flex-shrink-0" data-testid={`delete-bus-${b.id}`}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* PARADAS */}
          {tab === "paradas" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="space-y-5">
                <div className="bg-card border border-border rounded-xl p-4 md:p-5">
                  <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                    <Plus className="w-4 h-4 text-primary" /> Nueva parada
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs mb-1.5">Nombre de la parada</Label>
                      <Input value={paradaNombre} onChange={(e) => setParadaNombre(e.target.value)} placeholder="Ej: Terminal Central" className={inputCls} data-testid="input-parada-nombre" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs mb-1.5">Latitud</Label>
                        <Input value={paradaLat} onChange={(e) => setParadaLat(e.target.value)} placeholder="11.5444" className={`${inputCls} font-mono`} inputMode="decimal" data-testid="input-parada-lat" />
                      </div>
                      <div>
                        <Label className="text-xs mb-1.5">Longitud</Label>
                        <Input value={paradaLng} onChange={(e) => setParadaLng(e.target.value)} placeholder="-72.9072" className={`${inputCls} font-mono`} inputMode="decimal" data-testid="input-parada-lng" />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">Centro de Riohacha: Lat 11.5444, Lng -72.9072</p>
                    <Button onClick={handleCrearParada} disabled={crearParada.isPending} className="w-full h-11 rounded-xl" data-testid="button-crear-parada">
                      <Plus className="w-4 h-4 mr-2" />{crearParada.isPending ? "Creando..." : "Crear parada"}
                    </Button>
                  </div>
                </div>

                {rutas.length > 0 && paradas.length > 0 && (
                  <div className="bg-card border border-border rounded-xl p-4 md:p-5">
                    <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                      <Route className="w-4 h-4 text-purple-400" /> Asignar parada a ruta
                    </h3>
                    <div className="space-y-3">
                      <div>
                        <Label className="text-xs mb-1.5">Ruta</Label>
                        <Select value={asignarRutaId} onValueChange={setAsignarRutaId}>
                          <SelectTrigger className={selectTriggerCls} data-testid="select-asignar-ruta"><SelectValue placeholder="Selecciona ruta" /></SelectTrigger>
                          <SelectContent>{rutas.map((r) => <SelectItem key={r.id} value={r.id.toString()}>{r.nombre}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs mb-1.5">Parada</Label>
                        <Select value={asignarParadaId} onValueChange={setAsignarParadaId}>
                          <SelectTrigger className={selectTriggerCls} data-testid="select-asignar-parada"><SelectValue placeholder="Selecciona parada" /></SelectTrigger>
                          <SelectContent>{paradas.map((p) => <SelectItem key={p.id} value={p.id.toString()}>{p.nombre} ({p.latitud.toFixed(3)}, {p.longitud.toFixed(3)})</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs mb-1.5">Orden en la ruta</Label>
                        <Input value={asignarOrden} onChange={(e) => setAsignarOrden(e.target.value)} type="number" min="0" className={inputCls} inputMode="numeric" data-testid="input-asignar-orden" />
                      </div>
                      <Button onClick={handleAsignarParada} disabled={asignarParadaMutation.isPending} className="w-full h-11 rounded-xl" data-testid="button-asignar-parada">
                        <Route className="w-4 h-4 mr-2" />Asignar parada
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-card border border-border rounded-xl p-4 md:p-5">
                <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center justify-between">
                  <span className="flex items-center gap-2"><MapPin className="w-4 h-4 text-sky-400" /> Paradas registradas</span>
                  <span className="text-xs text-muted-foreground font-normal">{paradas.length} en total</span>
                </h3>
                {paradas.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No hay paradas. Crea la primera.</p>
                ) : (
                  <div className="space-y-2 max-h-[500px] overflow-y-auto">
                    {paradas.map((p) => (
                      <div key={p.id} className="flex items-start gap-3 p-3 bg-secondary/30 border border-border rounded-xl">
                        <MapPin className="w-3.5 h-3.5 text-sky-400 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{p.nombre}</p>
                          <p className="text-xs font-mono text-muted-foreground mt-0.5">{p.latitud.toFixed(5)}, {p.longitud.toFixed(5)}</p>
                        </div>
                        <span className="text-[10px] text-muted-foreground font-mono flex-shrink-0 mt-0.5">#{p.id}</span>
                        <Button
                          variant="ghost" size="sm"
                          onClick={() => handleDeleteParada(p.id, p.nombre)}
                          className="h-9 w-9 p-0 text-muted-foreground hover:text-destructive flex-shrink-0"
                          data-testid={`delete-parada-${p.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* CONDUCTORES */}
          {tab === "conductores" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Formulario de registro */}
              <div className="bg-card border border-border rounded-xl p-4 md:p-5 h-fit">
                <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-primary" /> Registrar conductor
                </h3>
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs mb-1.5">Nombre completo</Label>
                    <Input
                      value={condNombre}
                      onChange={(e) => setCondNombre(e.target.value)}
                      placeholder="Ej: Carlos Rodríguez"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <Label className="text-xs mb-1.5">Número de identificación (CC / CE)</Label>
                    <Input
                      value={condIdentificacion}
                      onChange={(e) => setCondIdentificacion(e.target.value)}
                      placeholder="Ej: 1234567890"
                      className={`${inputCls} font-mono`}
                      inputMode="numeric"
                    />
                  </div>
                  <div>
                    <Label className="text-xs mb-1.5">Correo (usuario para iniciar sesión)</Label>
                    <Input
                      value={condCorreo}
                      onChange={(e) => setCondCorreo(e.target.value)}
                      placeholder="conductor@transpadilla.co"
                      className={inputCls}
                      type="email"
                      inputMode="email"
                    />
                  </div>
                  <div>
                    <Label className="text-xs mb-1.5">Contraseña</Label>
                    <div className="relative">
                      <Input
                        value={condPassword}
                        onChange={(e) => setCondPassword(e.target.value)}
                        placeholder="Mínimo 6 caracteres"
                        className={`${inputCls} pr-11`}
                        type={condShowPass ? "text" : "password"}
                      />
                      <button
                        type="button"
                        onClick={() => setCondShowPass((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {condShowPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      El conductor usará este correo y contraseña para entrar al sistema.
                    </p>
                  </div>
                  <Button
                    onClick={handleRegistrarConductor}
                    disabled={condPending}
                    className="w-full h-11 rounded-xl"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    {condPending ? "Registrando..." : "Registrar conductor"}
                  </Button>
                </div>
              </div>

              {/* Lista de conductores */}
              <div className="bg-card border border-border rounded-xl p-4 md:p-5">
                <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-primary" /> Conductores registrados
                  </span>
                  <button onClick={fetchConductores} className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                    <RefreshCw className="w-3 h-3" /> Actualizar
                  </button>
                </h3>
                {conductoresLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-muted/40 rounded-xl animate-pulse" />)}
                  </div>
                ) : conductores.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No hay conductores registrados. Crea el primero.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-[500px] overflow-y-auto">
                    {conductores.map((c) => {
                      const assignedBus = buses.find((b) => b.conductor_id === c.id);
                      return (
                        <div key={c.id} className="p-3 bg-secondary/30 border border-border rounded-xl space-y-2">
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold" style={{ background: "rgba(23,87,194,0.2)", color: "var(--tp-sky)" }}>
                              {c.nombre.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-foreground truncate">{c.nombre}</p>
                              <p className="text-xs text-muted-foreground truncate">{c.correo}</p>
                              {c.identificacion && (
                                <p className="text-xs font-mono mt-0.5" style={{ color: "var(--tp-sky)" }}>
                                  CC {c.identificacion}
                                </p>
                              )}
                            </div>
                            <Button
                              variant="ghost" size="sm"
                              onClick={() => handleDeleteConductor(c.id, c.nombre)}
                              className="h-9 w-9 p-0 text-muted-foreground hover:text-destructive flex-shrink-0"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Bus asignado</p>
                            <Select
                              value={assignedBus?.id.toString() ?? "none"}
                              onValueChange={(v) =>
                                handleAsignarBusConductor(c.id, v === "none" ? null : parseInt(v, 10), assignedBus?.id ?? null)
                              }
                            >
                              <SelectTrigger className="h-8 text-xs rounded-lg bg-background border-border">
                                <SelectValue placeholder="Sin bus" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Sin bus asignado</SelectItem>
                                {buses.map((b) => (
                                  <SelectItem key={b.id} value={b.id.toString()}>
                                    {b.placa}{b.nombre_ruta ? ` — ${b.nombre_ruta}` : ""}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "trafico" && <TraficoTab />}
        </div>
      </div>
    </div>
  );
}
