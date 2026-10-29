import { en } from "./en";
import { id } from "./id";

export type Locale = "id" | "en";

type DeepString<T> = {
  [K in keyof T]: T[K] extends string ? string : DeepString<T[K]>;
};

export type Dictionary = DeepString<typeof id>;

export const LOCALE_COOKIE = "ShelfOpsRetail_locale";
export const DEFAULT_LOCALE: Locale = "id";

export const dictionaries: Record<Locale, Dictionary> = {
  id,
  en,
};

export function normalizeLocale(value?: string | null): Locale {
  return value === "en" ? "en" : "id";
}

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}
