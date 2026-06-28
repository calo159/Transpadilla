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
