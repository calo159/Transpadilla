// Traducción automática de la página con el widget "Website Translator" de
// Google. Se inyecta bajo demanda (solo si algún componente lo usa) y soporta
// varias instancias del widget en la página (escritorio + móvil) sin duplicar
// el script ni pisarse el callback de inicialización.

interface GoogleTranslateElementOptions {
  pageLanguage: string;
  includedLanguages?: string;
  layout?: number;
  autoDisplay?: boolean;
}
interface GoogleTranslateNamespace {
  TranslateElement: {
    new (options: GoogleTranslateElementOptions, containerId: string): void;
    InlineLayout: { SIMPLE: number; HORIZONTAL: number; VERTICAL: number };
  };
}
declare global {
  interface Window {
    google?: { translate?: GoogleTranslateNamespace };
    googleTranslateElementInit?: () => void;
  }
}

const pendientes = new Set<string>();
const inicializados = new Set<string>();
let scriptInyectado = false;

function inicializarPendientes(): void {
  const ns = window.google?.translate;
  if (!ns) return;
  for (const id of pendientes) {
    if (inicializados.has(id) || !document.getElementById(id)) continue;
    new ns.TranslateElement(
      {
        pageLanguage: "es",
        includedLanguages: "en,fr,pt,de,it",
        layout: ns.TranslateElement.InlineLayout.SIMPLE,
        autoDisplay: false,
      },
      id,
    );
    inicializados.add(id);
  }
}

/**
 * Registra un contenedor (por id) para el widget de Google Translate. Se puede
 * llamar varias veces (una por instancia del componente); el script externo se
 * inyecta una sola vez y el callback inicializa TODOS los contenedores
 * pendientes cuando Google avisa que está listo.
 */
export function registrarGoogleTranslate(containerId: string): void {
  pendientes.add(containerId);
  window.googleTranslateElementInit = inicializarPendientes;

  if (window.google?.translate) {
    inicializarPendientes();
    return;
  }
  if (scriptInyectado) return;
  scriptInyectado = true;
  const script = document.createElement("script");
  script.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
  script.async = true;
  document.body.appendChild(script);
}
