import type { BuiltInCategoryKey, CategoryFilter, CategoryKey } from "./types";

export const DATA_VERSION = 1;
export const BACKUP_VERSION = 2;
export const STORAGE_KEY = "gastos-app:v1";
export const LOCALE = "es-ES";
export const CURRENCY = "EUR";
export const NOTE_MAX_LENGTH = 120;

export interface CategoryInfo {
  label: string;
  /** Color para el gráfico y los indicadores de categoría. */
  color: string;
}

/** Categorías de siempre. Record<BuiltInCategoryKey, ...> obliga a definirlas todas. */
export const CATEGORIES: Record<BuiltInCategoryKey, CategoryInfo> = {
  supermercado: { label: "Supermercado", color: "#f6ad55" },
  personal: { label: "Personal", color: "#c084fc" },
  coche: { label: "Coche", color: "#6db7e8" },
  gasolina: { label: "Gasolina", color: "#f08a9d" },
  alquiler: { label: "Alquiler", color: "#5fd0c2" },
  casa: { label: "Casa", color: "#7aa2f7" },
  otros: { label: "Otros", color: "#a7a0b5" },
  social: { label: "Social", color: "#f0abfc" },
};

export const CATEGORY_KEYS = Object.keys(CATEGORIES) as BuiltInCategoryKey[];

/** Formato de las categorías creadas por la persona: "cat-" y un identificador aleatorio. */
const CUSTOM_CATEGORY_ID = /^cat-[a-z0-9-]{8,64}$/;

export function isBuiltInCategoryKey(value: unknown): value is BuiltInCategoryKey {
  return (
    typeof value === "string" && (CATEGORY_KEYS as readonly string[]).includes(value)
  );
}

/** Color de la porción "Ahorro" del gráfico. */
export const SAVINGS_COLOR = "#62c6a8";

/** Clave de categoría válida: una de las de siempre o una creada con formato "cat-…". */
export function isCategoryKey(value: unknown): value is CategoryKey {
  return (
    isBuiltInCategoryKey(value) ||
    (typeof value === "string" && CUSTOM_CATEGORY_ID.test(value))
  );
}

export function isCategoryFilter(value: unknown): value is CategoryFilter {
  return value === "all" || isCategoryKey(value);
}

/** Tamaño máximo de un archivo de copia de seguridad al importar. */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
