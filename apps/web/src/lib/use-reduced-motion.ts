"use client";

import { useEffect, useState } from "react";

// Menghormati preferensi sistem: animasi data (chart) dimatikan bila pengguna
// meminta gerak minimal. CSS global sudah menangani animasi deklaratif.
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const handler = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", handler);
    return () => query.removeEventListener("change", handler);
  }, []);

  return reduced;
}
