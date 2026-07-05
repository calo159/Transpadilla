// Clases/utilidades compartidas por los tabs del panel Admin.
import type { ReactNode } from "react";

/** Estilo común de los inputs del panel (alto/redondeo responsivo). */
export const inputCls =
  "bg-background border-border h-11 text-base rounded-xl md:h-9 md:text-sm md:rounded-lg";

/** Mismo estilo para los <SelectTrigger> del panel. */
export const selectTriggerCls = inputCls;

/** Tarjeta estándar de los tabs — estilo stitch: fondo blanco, borde sutil, sombra suave */
export const cardCls = "bg-white border border-outline-variant/30 rounded-xl p-4 md:rounded-xl md:p-5 shadow-sm";

/**
 * Deja el formulario "pegado" (sticky) bajo la topbar mientras la lista de al
 * lado scrollea, en pantallas anchas (`lg:`). Por debajo de `lg` no cambia nada.
 */
export const stickyFormCls = "h-fit lg:sticky lg:top-20";

/**
 * Encabezado de sección institucional: barra dorada + ícono + título en
 * versalitas (Plus Jakarta), con un slot opcional a la derecha para conteo o
 * acción. Le da identidad de marca al panel (vs. el h3 gris genérico anterior)
 * y, al vivir aquí, se propaga a los 4 tabs CRUD + Dashboard.
 */
export function SectionHeader({ icon, title, count, action }: {
  icon: ReactNode;
  title: string;
  count?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-2">
      <span className="flex items-center gap-2.5">
        <span aria-hidden className="inline-block w-1 h-4 rounded-full" style={{ background: "var(--color-gold)" }} />
        {icon}
        <span className="font-display text-[13px] font-extrabold uppercase tracking-wide" style={{ color: "var(--color-navy)" }}>{title}</span>
      </span>
      {count != null && <span className="text-xs text-muted-foreground font-normal">{count}</span>}
      {action}
    </div>
  );
}
