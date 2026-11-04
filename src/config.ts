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
  personal: { label: "Personal", color: "#c084fc" },
  social: { label: "Social", color: "#f0abfc" },
  supermercado: { label: "Supermercado", color: "#f6ad55" },
  casa: { label: "Casa", color: "#7aa2f7" },
  alquiler: { label: "Alquiler", color: "#5fd0c2" },
  gasolina: { label: "Gasolina", color: "#f08a9d" },
  coche: { label: "Coche", color: "#6db7e8" },
  otros: { label: "Otros", color: "#a7a0b5" },
};

export const CATEGORY_KEYS = Object.keys(CATEGORIES) as CategoryKey[];

/** Color de la porción "Ahorro" del gráfico. */
export const SAVINGS_COLOR = "#62c6a8";

export function isCategoryKey(value: unknown): value is CategoryKey {
  return (
    typeof value === "string" && (CATEGORY_KEYS as readonly string[]).includes(value)
  );
}

export function isCategoryFilter(value: unknown): value is CategoryFilter {
  return value === "all" || isCategoryKey(value);
}

/** Tamaño máximo de un archivo de copia de seguridad al importar. */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
