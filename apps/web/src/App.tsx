import { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { setAuthTokenGetter } from "@workspace/api-client";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LogoTP } from "@/components/LogoTP";
import Pasajero from "@/pages/Pasajero";

// Pasajero (ruta "/") va eager por ser la landing más usada; el resto se carga
// bajo demanda para que el pasajero no baje el panel Admin/Conductor/Login al entrar.
const Login = lazy(() => import("@/pages/Login"));
const Conductor = lazy(() => import("@/pages/Conductor"));
const Admin = lazy(() => import("@/pages/Admin"));
const Privacidad = lazy(() => import("@/pages/Privacidad"));
const Terminos = lazy(() => import("@/pages/Terminos"));
const NotFound = lazy(() => import("@/pages/not-found"));

setAuthTokenGetter(() => localStorage.getItem("transpadilla_token"));

// Pantalla de transición mientras se descarga el chunk de una ruta diferida.
function RouteFallback() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-4"
      style={{ background: "radial-gradient(ellipse at 50% -10%, #1757C2 0%, #0D2461 35%, #080D18 70%)" }}
    >
      <LogoTP size={72} />
      <div
        className="w-8 h-8 rounded-full animate-spin"
        style={{ border: "3px solid rgba(255,255,255,0.25)", borderTopColor: "#4BA9D8" }}
      />
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5000,
    },
  },
});

function Router() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Switch>
        <Route path="/" component={Pasajero} />
        <Route path="/login" component={Login} />
        <Route path="/conductor" component={Conductor} />
        <Route path="/admin" component={Admin} />
        <Route path="/privacidad" component={Privacidad} />
        <Route path="/terminos" component={Terminos} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;