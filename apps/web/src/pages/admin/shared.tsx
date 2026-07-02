// Clases/utilidades compartidas por los tabs del panel Admin.
import type { ReactNode } from "react";

/** Estilo común de los inputs del panel (alto/redondeo responsivo). */
export const inputCls =
  "bg-background border-border h-11 text-base rounded-xl md:h-9 md:text-sm md:rounded-lg";

/** Mismo estilo para los <SelectTrigger> del panel. */
export const selectTriggerCls = inputCls;

/** Tarjeta estándar de los tabs: igual que antes en móvil, un poco más rica en escritorio. */
export const cardCls = "bg-card border border-border rounded-xl p-4 md:rounded-2xl md:p-5 md:shadow-sm";

/**
 * Deja el formulario "pegado" (sticky) bajo la topbar mientras la lista de al
 * lado scrollea, en pantallas anchas (`lg:`). Por debajo de `lg` no cambia nada.
 */
export const stickyFormCls = "h-fit lg:sticky lg:top-20";

/**
 * Encabezado de sección estándar de los tabs del admin: mismo markup que ya
 * usaban (`h3` con ícono + título, y un slot opcional a la derecha para un
 * conteo o una acción), para que los 4 tabs CRUD se vean consistentes.
 */
export function SectionHeader({ icon, title, count, action }: {
  icon: ReactNode;
  title: string;
  count?: string;
  action?: ReactNode;
}) {
  return (
    <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center justify-between">
      <span className="flex items-center gap-2">{icon} {title}</span>
      {count != null && <span className="text-xs text-muted-foreground font-normal">{count}</span>}
      {action}
    </h3>
  );
}
