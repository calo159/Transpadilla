import { useState } from "react";
import { useLocation } from "wouter";
import {
  useGetRutas, useGetBuses, useGetStats, useGetTodasParadas,
  useCreateRuta, useDeleteRuta, useCreateBus, useDeleteBus,
  useCrearParada, useAsignarParada,
  getGetRutasQueryKey, getGetBusesQueryKey, getGetTodasParadasQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getUser, clearAuth } from "@/lib/auth";
import {
  Bus, LogOut, Map, MapPin, BarChart3, Plus, Trash2,
  RefreshCw, Users, Activity, AlertTriangle, Route,
  Clock, Radio, TrafficCone, ChevronLeft,
} from "lucide-react";
import TraficoTab from "./TraficoTab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { LogoTP } from "@/components/LogoTP";

type Tab = "dashboard" | "rutas" | "buses" | "paradas" | "trafico";

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

  const handleCreateRuta = async () => {
    if (!rutaNombre.trim()) { toast({ title: "El nombre de la ruta es obligatorio", variant: "destructive" }); return; }
    await createRuta.mutateAsync({ data: { nombre: rutaNombre.trim(), color: rutaColor } });
    queryClient.invalidateQueries({ queryKey: getGetRutasQueryKey() });
    queryClient.invalidateQueries({ queryKey: ["stats"] });
    setRutaNombre(""); setRutaColor("#1757C2");
    toast({ title: "Ruta creada exitosamente" });
  };

  const handleDeleteRuta = async (id: number, nombre: string) => {
    if (!confirm(`¿Eliminar la ruta "${nombre}"? Esta acción no se puede deshacer.`)) return;
    await deleteRuta.mutateAsync({ id });
    queryClient.invalidateQueries({ queryKey: getGetRutasQueryKey() });
    queryClient.invalidateQueries({ queryKey: ["stats"] });
    toast({ title: `Ruta "${nombre}" eliminada` });
  };

  const handleCreateBus = async () => {
    if (!busPlaca.trim()) { toast({ title: "La placa es obligatoria", variant: "destructive" }); return; }
    await createBus.mutateAsync({ data: { placa: busPlaca.trim().toUpperCase(), ruta_id: busRutaId ? parseInt(busRutaId, 10) : null } });
    queryClient.invalidateQueries({ queryKey: getGetBusesQueryKey() });
    queryClient.invalidateQueries({ queryKey: ["stats"] });
    setBusPlaca(""); setBusRutaId("");
    toast({ title: "Bus registrado exitosamente" });
  };

  const handleDeleteBus = async (id: number, placa: string) => {
    if (!confirm(`¿Eliminar el bus "${placa}"?`)) return;
    await deleteBus.mutateAsync({ id });
    queryClient.invalidateQueries({ queryKey: getGetBusesQueryKey() });
    queryClient.invalidateQueries({ queryKey: ["stats"] });
    toast({ title: `Bus "${placa}" eliminado` });
  };

  const handleCrearParada = async () => {
    if (!paradaNombre.trim() || !paradaLat || !paradaLng) { toast({ title: "Completa todos los campos", variant: "destructive" }); return; }
    const lat = parseFloat(paradaLat); const lng = parseFloat(paradaLng);
    if (isNaN(lat) || isNaN(lng)) { toast({ title: "Latitud y longitud deben ser números", variant: "destructive" }); return; }
    await crearParada.mutateAsync({ data: { nombre: paradaNombre.trim(), latitud: lat, longitud: lng } });
    queryClient.invalidateQueries({ queryKey: getGetTodasParadasQueryKey() });
    queryClient.invalidateQueries({ queryKey: ["stats"] });
    setParadaNombre(""); setParadaLat(""); setParadaLng("");
    toast({ title: "Parada creada" });
  };

  const handleAsignarParada = async () => {
    if (!asignarRutaId || !asignarParadaId) { toast({ title: "Selecciona ruta y parada", variant: "destructive" }); return; }
    await asignarParadaMutation.mutateAsync({ id: parseInt(asignarRutaId, 10), data: { parada_id: parseInt(asignarParadaId, 10), orden: parseInt(asignarOrden, 10) || 0 } });
    queryClient.invalidateQueries({ queryKey: getGetRutasQueryKey() });
    setAsignarParadaId(""); setAsignarOrden("0");
    toast({ title: "Parada asignada a la ruta" });
  };

  const navItems = [
    { id: "dashboard" as Tab, label: "Dashboard", icon: <BarChart3 className="w-4 h-4" /> },
    { id: "rutas"     as Tab, label: "Rutas",     icon: <Route className="w-4 h-4" /> },
    { id: "buses"     as Tab, label: "Buses",     icon: <Bus className="w-4 h-4" /> },
    { id: "paradas"   as Tab, label: "Paradas",   icon: <MapPin className="w-4 h-4" /> },
    { id: "trafico"   as Tab, label: "Tráfico",   icon: <TrafficCone className="w-4 h-4" /> },
  ];

  const activeBuses   = buses.filter((b) => b.estado === "activo");
  const inactiveBuses = buses.filter((b) => b.estado === "inactivo");
  const demoraBuses   = buses.filter((b) => b.estado === "demora");

  const tabTitle: Record<Tab, string> = {
    dashboard: "Dashboard",
    rutas:     "Gestión de Rutas",
    buses:     "Gestión de Buses",
    paradas:   "Gestión de Paradas",
    trafico:   "Monitoreo de Tráfico",
  };

  const inputCls = "bg-background border-border h-11 text-base rounded-xl md:h-9 md:text-sm md:rounded-lg";
  const selectTriggerCls = "bg-background border-border h-11 text-base rounded-xl md:h-9 md:text-sm md:rounded-lg";

  return (
    <div className="flex h-screen bg-background overflow-hidden">

      {/* ─── DESKTOP SIDEBAR ─────────────────────────────────────────────── */}
      <div className="hidden md:flex flex-col w-56 min-w-56 bg-sidebar border-r border-border">
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
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              data-testid={`nav-${item.id}`}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                tab === item.id
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-border space-y-1.5">
          <Button
            variant="ghost" size="sm"
            className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground h-8"
            onClick={() => setLocation("/")}
          >
            <ChevronLeft className="w-3.5 h-3.5" />Ir al mapa
          </Button>
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
        <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-sidebar shrink-0">
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
        <div className="md:hidden flex border-b border-border bg-sidebar shrink-0 overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" }}>
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              data-testid={`nav-${item.id}`}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors flex-shrink-0 ${
                tab === item.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>

        {/* ── DESKTOP TOPBAR ── */}
        <div className="hidden md:flex items-center justify-between px-6 py-3 border-b border-border bg-sidebar/50 shrink-0">
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
                        { label: "Activos",    items: activeBuses,  style: "border-green-500/20 bg-green-500/5 text-green-400" },
                        { label: "Con demora", items: demoraBuses,  style: "border-amber-500/20 bg-amber-500/5 text-amber-400" },
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
                        <SelectItem value="0">Sin ruta</SelectItem>
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
                        <span className="text-[10px] text-muted-foreground font-mono flex-shrink-0">#{p.id}</span>
                      </div>
                    ))}
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
