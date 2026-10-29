import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Uniform affordance for identity links inside table cells / lists
 * (store names, session IDs, document titles). Subtle but visible:
 * thin border-colored underline at rest, accent on hover.
 */
export const linkIdentityClass =
  "rounded font-medium text-foreground underline decoration-border decoration-1 underline-offset-2 transition-[text-decoration-color,color] hover:text-accent hover:decoration-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
