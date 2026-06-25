import { useState } from "react";

/**
 * Logo oficial de TransPadilla — emblema circular (sol + colinas + carretera)
 * sobre fondo blanco, tal cual el logo de la marca.
 *
 * Usa la imagen real `/logo-transpadilla.png` si está disponible en `public/`.
 * Si no la encuentra, dibuja un emblema SVG fiel como respaldo, de modo que
 * la app nunca queda sin logo.
 *
 * Para usar el logo oficial: guarda la imagen como
 *   artifacts/transpadilla/public/logo-transpadilla.png
 */
export function LogoTP({
  size = 40,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  const [imgError, setImgError] = useState(false);

  return (
    <div
      className={`rounded-full bg-white flex items-center justify-center overflow-hidden flex-shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        boxShadow: "0 4px 14px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.08)",
      }}
    >
      {!imgError ? (
        <img
          src="/logo-transpadilla.png"
          alt="TransPadilla"
          width={size}
          height={size}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <LogoEmblemaSVG size={size} />
      )}
    </div>
  );
}

/** Emblema SVG fiel: cielo celeste, sol amarillo, colinas azul marino y carretera. */
function LogoEmblemaSVG({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id="tp-clip">
          <circle cx="60" cy="60" r="60" />
        </clipPath>
      </defs>
      <g clipPath="url(#tp-clip)">
        {/* Fondo blanco */}
        <rect width="120" height="120" fill="white" />
        {/* Cielo celeste (círculo claro superior) */}
        <circle cx="60" cy="52" r="34" fill="#A9D5EA" />
        {/* Sol amarillo */}
        <circle cx="60" cy="55" r="15" fill="#F5B731" />
        {/* Colina trasera azul medio */}
        <path d="M-5 78 Q30 60 62 70 Q92 79 125 64 L125 120 L-5 120 Z" fill="#1B4D8F" />
        {/* Colina frontal azul marino */}
        <path d="M-5 88 Q35 72 64 80 Q95 88 125 76 L125 120 L-5 120 Z" fill="#1B3B6F" />
        {/* Carretera amarilla en perspectiva */}
        <path d="M60 70 L50 120 L70 120 Z" fill="#F5B731" opacity="0.95" />
        {/* Línea central de la carretera */}
        <path d="M60 78 L60 118" stroke="white" strokeWidth="2" strokeDasharray="3 4" strokeLinecap="round" opacity="0.7" />
      </g>
    </svg>
  );
}

/**
 * Wordmark completo: emblema + texto "TransPadilla" + tagline.
 * Útil para encabezados grandes (login, splash).
 */
export function LogoTPFull({
  size = 64,
  dark = false,
}: {
  size?: number;
  dark?: boolean;
}) {
  const textColor = dark ? "#1B3B6F" : "white";
  return (
    <div className="flex items-center gap-3">
      <LogoTP size={size} />
      <div className="leading-tight">
        <p className="font-black tracking-wide" style={{ fontSize: size * 0.34, color: textColor }}>
          Trans<span style={{ color: "#7BB8D5" }}>Padilla</span>
        </p>
        <p className="font-semibold tracking-[0.18em] uppercase" style={{ fontSize: size * 0.14, color: "#F5B731" }}>
          Moviendo la Ciudad
        </p>
      </div>
    </div>
  );
}

export default LogoTP;
