"use client";

import * as React from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

const SHOW_DELAY_MS = 150;
const MIN_TOP_SPACE = 32;

export function Tooltip({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  const wrapperRef = React.useRef<HTMLSpanElement | null>(null);
  const timerRef = React.useRef<number | null>(null);
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState<{ x: number; y: number; below: boolean } | null>(
    null,
  );
  const id = React.useId();

  const clearTimer = React.useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const hide = React.useCallback(() => {
    clearTimer();
    setOpen(false);
  }, [clearTimer]);

  const computePosition = React.useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const below = rect.top < MIN_TOP_SPACE;
    setPos({
      x: Math.min(Math.max(rect.left + rect.width / 2, 120), window.innerWidth - 120),
      y: below ? rect.bottom + 6 : rect.top - 6,
      below,
    });
  }, []);

  const show = React.useCallback(() => {
    clearTimer();
    computePosition();
    timerRef.current = window.setTimeout(() => {
      // Recompute right before showing: the trigger may have moved during the delay.
      computePosition();
      setOpen(true);
    }, SHOW_DELAY_MS);
  }, [clearTimer, computePosition]);

  const handlePointerDown = React.useCallback(
    (e: React.PointerEvent<HTMLSpanElement>) => {
      if (e.pointerType !== "touch") return;
      e.preventDefault();
      setOpen((v) => !v);
    },
    [],
  );

  // Close on tap outside while open (touch).
  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Recompute while open on scroll/resize, hide on any scroll (fixed tooltip
  // would drift relative to an overflow-scrolled container).
  React.useEffect(() => {
    if (!open) return;
    const onHide = () => hide();
    const onRecompute = () => computePosition();
    window.addEventListener("scroll", onHide, true);
    window.addEventListener("resize", onRecompute);
    return () => {
      window.removeEventListener("scroll", onHide, true);
      window.removeEventListener("resize", onRecompute);
    };
  }, [open, hide, computePosition]);

  React.useEffect(() => clearTimer, [clearTimer]);

  return (
    <>
      <span
        ref={wrapperRef}
        className={cn("inline-flex", className)}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onPointerDown={handlePointerDown}
        aria-describedby={open ? id : undefined}
      >
        {children}
      </span>
      {open && pos
        ? createPortal(
            <span
              id={id}
              role="tooltip"
              style={{
                position: "fixed",
                left: pos.x,
                top: pos.y,
                transform: pos.below ? "translate(-50%, 0)" : "translate(-50%, -100%)",
              }}
              className={cn(
                "pointer-events-none z-50 max-w-[220px] whitespace-normal rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground shadow-md",
                "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150",
              )}
            >
              {label}
            </span>,
            document.body,
          )
        : null}
    </>
  );
}
