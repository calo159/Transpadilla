import { useEffect, useRef, useState } from "react";
import { formatearDuracion } from "@/lib/format";

/**
 * Cronómetro de UI: mientras `running` es true cuenta el tiempo transcurrido y
 * lo devuelve ya formateado ("M:SS" / "H:MM:SS"). Al detenerse se reinicia a 0.
 * Usa requestAnimationFrame para no depender de un setInterval impreciso.
 */
export function useElapsedTime(running: boolean): string {
  const [seconds, setSeconds] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (running) {
      startRef.current = Date.now() - seconds * 1000;
      const tick = () => {
        setSeconds(Math.floor((Date.now() - startRef.current!) / 1000));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } else {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      setSeconds(0);
    }
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  return formatearDuracion(seconds);
}
