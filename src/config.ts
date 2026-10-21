import type { CategoryFilter, CategoryKey } from "./types";

export const DATA_VERSION = 1;
export const STORAGE_KEY = "gastos-app:v1";
export const LOCALE = "es-ES";
export const CURRENCY = "EUR";
export const NOTE_MAX_LENGTH = 120;

export interface CategoryInfo {
  label: string;
  /** Color para el gráfico y los indicadores de categoría. */
  color: string;
}

/** Record<CategoryKey, ...> obliga a definir todas las categorías. */
export const CATEGORIES: Record<CategoryKey, CategoryInfo> = {
  personal: { label: "Personal", color: "#ec4899" },
  social: { label: "Social", color: "#8b5cf6" },
  supermercado: { label: "Supermercado", color: "#f97316" },
  casa: { label: "Casa", color: "#eab308" },
  alquiler: { label: "Alquiler", color: "#3b82f6" },
  gasolina: { label: "Gasolina", color: "#ef4444" },
  coche: { label: "Coche", color: "#06b6d4" },
  otros: { label: "Otros", color: "#94a3b8" },
};

export const CATEGORY_KEYS = Object.keys(CATEGORIES) as CategoryKey[];

/** Color de la porción "Ahorro" del gráfico. */
export const SAVINGS_COLOR = "#16a34a";

export function isCategoryKey(value: unknown): value is CategoryKey {
  return (
    typeof value === "string" && (CATEGORY_KEYS as readonly string[]).includes(value)
  );
}

export function isCategoryFilter(value: unknown): value is CategoryFilter {
  return value === "all" || isCategoryKey(value);
}
