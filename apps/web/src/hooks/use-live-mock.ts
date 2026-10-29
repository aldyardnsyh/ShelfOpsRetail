"use client";

import { useEffect, useState } from "react";

import { useReducedMotion } from "@/lib/use-reduced-motion";

/**
 * Satu sumber tick untuk semua komponen mock realtime (kamera, pengunjung).
 * - Interval di-clear saat unmount.
 * - Tidak berjalan bila pengguna meminta reduced motion (animasi data off).
 * - `enabled` false menghentikan tick (mis. kamera offline).
 */
export function useLiveMockTick(intervalMs: number, options?: { enabled?: boolean }) {
  const reduced = useReducedMotion();
  const enabled = (options?.enabled ?? true) && !reduced;
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs]);

  return tick;
}

/** PRNG deterministik: input seed sama -> hasil sama (aman untuk fixtures demo). */
export function seededRandom(seed: number) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
