// ============================================================================
//  Generador de iconos de TransPadilla
//  Crea favicon e iconos PWA a partir de public/logo-transpadilla.png
//
//  Uso:  node generar-iconos.mjs
//  (vuelve a ejecutarlo si cambias el logo)
// ============================================================================
import sharp from "sharp";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pub = path.join(__dirname, "public");
const origen = path.join(pub, "logo-transpadilla.png");

// Fondo blanco (el logo de TransPadilla va sobre blanco)
const FONDO = { r: 255, g: 255, b: 255, alpha: 1 };

const tareas = [
  { nombre: "pwa-192x192.png", size: 192, padding: 0 },
  { nombre: "pwa-512x512.png", size: 512, padding: 0 },
  { nombre: "apple-touch-icon.png", size: 180, padding: 0 },
  { nombre: "favicon-32x32.png", size: 32, padding: 0 },
  { nombre: "favicon-16x16.png", size: 16, padding: 0 },
  { nombre: "favicon.png", size: 64, padding: 0 },
];

async function generar() {
  for (const t of tareas) {
    const destino = path.join(pub, t.nombre);
    await sharp(origen)
      .resize(t.size, t.size, { fit: "contain", background: FONDO })
      .flatten({ background: FONDO })
      .png()
      .toFile(destino);
    console.log(`  ✓ ${t.nombre} (${t.size}x${t.size})`);
  }
  console.log("\nIconos generados correctamente en public/");
}

generar().catch((e) => {
  console.error("Error generando iconos:", e.message);
  process.exit(1);
});
