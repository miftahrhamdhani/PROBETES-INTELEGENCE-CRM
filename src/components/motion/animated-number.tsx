"use client";

import * as React from "react";
import { animate, useReducedMotion } from "framer-motion";

/**
 * Transisi angka KPI saat berubah (bukan animasi hitung dari nol setiap render
 * — hanya ketika `value` benar-benar berubah, mis. filter/tanggal diganti).
 * Dinonaktifkan untuk prefers-reduced-motion (langsung tampil nilai akhir).
 */
export function AnimatedNumber({ value, formatter }: { value: number; formatter?: (n: number) => string }) {
  const reduceMotion = useReducedMotion();
  const format = formatter ?? ((n: number) => Math.round(n).toLocaleString("id-ID"));
  const [display, setDisplay] = React.useState(value);
  const previous = React.useRef(value);

  React.useEffect(() => {
    if (reduceMotion) {
      setDisplay(value);
      previous.current = value;
      return;
    }
    const controls = animate(previous.current, value, {
      duration: 0.5,
      ease: "easeOut",
      onUpdate: (v) => setDisplay(v),
      onComplete: () => {
        previous.current = value;
      },
    });
    return () => controls.stop();
  }, [value, reduceMotion]);

  return <span className="tabular">{format(display)}</span>;
}
