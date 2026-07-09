/**
 * Escapa HTML para inyectar texto (de la BD/usuario) de forma segura en lugares
 * que usan innerHTML — p. ej. los popups y tooltips de Leaflet, que NO pasan por
 * el escape automático de React. Evita XSS almacenado (un nombre de ruta/parada o
 * una novedad del conductor con `<script>`/`<img onerror>` se muestra literal).
 */
export const escHtml = (s: string): string =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
  );

/**
 * Devuelve el color si es un hex CSS válido (#RGB o #RRGGBB), o un color de
 * respaldo si no. El color de ruta/bus se interpola crudo en `style="background:${color}"`
 * dentro del HTML de los íconos/popups de Leaflet; el backend ya lo valida al
 * escribir (`colorHex`), pero no conviene depender de una única validación —
 * sin esto, un valor corrupto podría romper el atributo `style` e inyectar HTML.
 */
export const colorSeguro = (color: string, fallback = "#2558A5"): string =>
  /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color) ? color : fallback;
