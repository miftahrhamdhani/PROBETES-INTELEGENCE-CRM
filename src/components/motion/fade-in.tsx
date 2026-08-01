"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

interface FadeInStaggerProps {
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}

/**
 * Entrance halus untuk grup KPI/card — stagger ringan per anak langsung
 * (bukan animasi berat), dinonaktifkan untuk prefers-reduced-motion.
 * Bungkus grid/section yang anak-anaknya ingin muncul bertahap.
 */
export function FadeInStagger({ children, className, ...rest }: FadeInStaggerProps) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return <div className={className} {...rest}>{children}</div>;

  return (
    <motion.div
      className={className}
      {...rest}
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
    >
      {children}
    </motion.div>
  );
}

export function FadeInItem({ children, className }: { children: ReactNode; className?: string }) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
