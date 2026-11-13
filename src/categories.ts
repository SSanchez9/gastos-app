import { CATEGORIES, CATEGORY_KEYS, isBuiltInCategoryKey } from "./config";
import type {
  AppData,
  BuiltInCategoryKey,
  CategoryColor,
  CategoryIcon,
  CategoryKey,
  RecurringExpense,
  Result,
  UserCategory,
} from "./types";

/** Categorías con las que empieza una persona nueva. */
export const BASE_CATEGORY_KEYS: readonly BuiltInCategoryKey[] = [
  "social",
  "otros",
  "casa",
  "personal",
];

/** Categoría que recoge los movimientos de las categorías que se borran. */
export const FALLBACK_CATEGORY: BuiltInCategoryKey = "otros";

export const CATEGORY_NAME_MAX_LENGTH = 40;

export const CATEGORY_ICONS: readonly CategoryIcon[] = [
  "cart",
  "user",
  "car",
  "fuel",
  "key",
  "home",
  "tag",
  "social",
  "plane",
  "heart",
  "gift",
  "book",
];

/** Orden en que se asignan los colores a las categorías nuevas. */
export const CATEGORY_COLORS: readonly CategoryColor[] = [
  "plum",
  "orange",
  "green",
  "blue",
  "rose",
  "sky",
  "brick",
  "grey",
];

const BUILT_IN_LOOK: Record<
  BuiltInCategoryKey,
  { icon: CategoryIcon; color: CategoryColor }
> = {
  alquiler: { icon: "key", color: "plum" },
  coche: { icon: "car", color: "orange" },
  social: { icon: "social", color: "green" },
  casa: { icon: "home", color: "blue" },
  supermercado: { icon: "cart", color: "rose" },
  personal: { icon: "user", color: "sky" },
  gasolina: { icon: "fuel", color: "brick" },
  otros: { icon: "tag", color: "grey" },
};

/** Categoría de siempre con su nombre, icono y color por defecto. */
export function builtInCategory(key: BuiltInCategoryKey): UserCategory {
  return { id: key, name: CATEGORIES[key].label, ...BUILT_IN_LOOK[key], createdAt: 0 };
}

/**
 * Lista de categorías de la persona. Si aún no tiene una guardada (datos anteriores
 * a esta función), se calcula sin escribir nada: las básicas y las de siempre que ya
 * aparezcan en sus movimientos o gastos fijos, en el orden de siempre.
 */
export function getCategories(
  data: Pick<AppData, "categories" | "expenses" | "recurring">,
): UserCategory[] {
  if (data.categories !== undefined) return data.categories;
  const used = new Set<CategoryKey>([
    ...data.expenses.map((expense) => expense.category),
    ...(data.recurring ?? []).map((item) => item.category),
  ]);
  return CATEGORY_KEYS.filter(
    (key) => BASE_CATEGORY_KEYS.includes(key) || used.has(key),
  ).map(builtInCategory);
}

/**
 * Datos para mostrar una categoría, aunque ya no esté en la lista: las de siempre
 * conservan su nombre y las desconocidas se muestran como «Sin categoría».
 */
export function findCategory(
  categories: readonly UserCategory[],
  id: CategoryKey,
): UserCategory {
  const found = categories.find((category) => category.id === id);
  if (found) return found;
  if (isBuiltInCategoryKey(id)) return builtInCategory(id);
  return { id, name: "Sin categoría", icon: "tag", color: "grey", createdAt: 0 };
}

/** Minúsculas y sin tildes, para comparar nombres y textos. */
export function normalizeName(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("es").trim();
}

const ICON_RULES: readonly [RegExp, CategoryIcon][] = [
  [/super|compra|mercad|aliment|comida/, "cart"],
  [/gasol|combust|diesel/, "fuel"],
  [/coche|moto|taller|parking|aparcamiento|transporte/, "car"],
  [/alquiler|hipoteca/, "key"],
  [/casa|hogar|luz|agua|internet|factura/, "home"],
  [/social|amig|ocio|cena|bar|restaur|fiesta/, "social"],
  [/personal|ropa|belleza|peluquer/, "user"],
  [/viaje|vacacion|vuelo|hotel/, "plane"],
  [/salud|medic|farmacia|gimnas|deporte/, "heart"],
  [/regalo|cumple/, "gift"],
  [/estudio|curso|libro|formacion|educa|clase/, "book"],
];

/** Icono a partir del nombre; si no reconoce ninguna palabra, una etiqueta. */
export function guessCategoryIcon(name: string): CategoryIcon {
  const normalized = normalizeName(name);
  return ICON_RULES.find(([pattern]) => pattern.test(normalized))?.[1] ?? "tag";
}

/** Primer color de la paleta que aún no usa ninguna categoría (o el menos usado). */
export function nextCategoryColor(categories: readonly UserCategory[]): CategoryColor {
  const uses = (color: CategoryColor): number =>
    categories.filter((category) => category.color === color).length;
  return CATEGORY_COLORS.reduce((best, color) =>
    uses(color) < uses(best) ? color : best,
  );
}

/** Crea una categoría nueva con icono y color automáticos. `id` debe empezar por "cat-". */
export function createCategory(
  name: string,
  existing: readonly UserCategory[],
  id: CategoryKey,
  createdAt: number,
): Result<UserCategory> {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) return { ok: false, error: "Escribe un nombre para la categoría." };
  if (trimmed.length > CATEGORY_NAME_MAX_LENGTH)
    return {
      ok: false,
      error: `El nombre no puede superar los ${CATEGORY_NAME_MAX_LENGTH} caracteres.`,
    };
  const normalized = normalizeName(trimmed);
  if (existing.some((category) => normalizeName(category.name) === normalized))
    return { ok: false, error: `Ya tienes una categoría llamada «${trimmed}».` };
  return {
    ok: true,
    value: {
      id,
      name: trimmed,
      icon: guessCategoryIcon(trimmed),
      color: nextCategoryColor(existing),
      createdAt,
    },
  };
}

export interface CategoryDeletionPlan {
  /** Lista de categorías tras el borrado. */
  categories: UserCategory[];
  /** Movimientos que pasan a «Otros». */
  expenseIds: string[];
  /** Gastos fijos tras el borrado (los de esa categoría pasan a «Otros»). */
  recurring: RecurringExpense[];
  movedRecurring: number;
}

/**
 * Calcula qué supone borrar una categoría: sus movimientos y gastos fijos pasan a
 * «Otros», que se vuelve a crear si se había borrado. «Otros» solo se puede borrar
 * si no tiene movimientos, y siempre debe quedar al menos una categoría.
 */
export function planCategoryDeletion(
  data: Pick<AppData, "categories" | "expenses" | "recurring">,
  id: CategoryKey,
): Result<CategoryDeletionPlan> {
  const categories = getCategories(data);
  const target = categories.find((category) => category.id === id);
  if (!target) return { ok: false, error: "Esa categoría ya no existe." };
  const remaining = categories.filter((category) => category.id !== id);
  if (remaining.length === 0)
    return { ok: false, error: "Tiene que quedar al menos una categoría." };

  const expenseIds = data.expenses
    .filter((expense) => expense.category === id)
    .map((expense) => expense.id);
  const recurring = data.recurring ?? [];
  const movedRecurring = recurring.filter((item) => item.category === id).length;
  const hasMovements = expenseIds.length > 0 || movedRecurring > 0;

  if (id === FALLBACK_CATEGORY && hasMovements)
    return {
      ok: false,
      error:
        "«Otros» recoge los movimientos de las categorías que borras: solo se puede borrar cuando no tiene movimientos ni gastos fijos.",
    };

  const withFallback =
    hasMovements && !remaining.some((category) => category.id === FALLBACK_CATEGORY)
      ? [...remaining, builtInCategory(FALLBACK_CATEGORY)]
      : remaining;

  return {
    ok: true,
    value: {
      categories: withFallback,
      expenseIds,
      recurring: recurring.map((item) =>
        item.category === id ? { ...item, category: FALLBACK_CATEGORY } : item,
      ),
      movedRecurring,
    },
  };
}

const KEYWORD_RULES: readonly [RegExp, BuiltInCategoryKey][] = [
  [/gasolina|combustible|fuel/, "gasolina"],
  [
    /supermercado|mercadona|carrefour|lidl|compra|batido|leche|cocacola|coca cola|monster/,
    "supermercado",
  ],
  [/alquiler/, "alquiler"],
  [/coche|parking|aparcamiento|taller|mantenimiento/, "coche"],
  [/casa|luz|agua|internet|hogar|digi/, "casa"],
  [/amigo|amiga|cena|bar|restaurante|cine/, "social"],
  [
    /ropa|farmacia|peluqueria|cejas|pull|berska|berskha|zara|gimnasio|personal/,
    "personal",
  ],
];

/**
 * Categoría para la entrada rápida («12 café», «45 supermercado ayer»): primero el
 * nombre de una categoría de la persona; después palabras habituales, si esa categoría
 * está en su lista; si no, «Otros» o la primera categoría que tenga.
 */
export function guessCategoryFromText(
  text: string,
  categories: readonly UserCategory[],
): CategoryKey | null {
  if (categories.length === 0) return null;
  const normalized = normalizeName(text);
  const byName = categories.find((category) => {
    const name = normalizeName(category.name);
    return (
      name.length > 0 &&
      new RegExp(`(^|\\s)${escapeRegExp(name)}(\\s|$)`).test(normalized)
    );
  });
  if (byName) return byName.id;
  const available = new Set(categories.map((category) => category.id));
  const byKeyword = KEYWORD_RULES.find(
    ([pattern, key]) => available.has(key) && pattern.test(normalized),
  );
  if (byKeyword) return byKeyword[1];
  return available.has(FALLBACK_CATEGORY)
    ? FALLBACK_CATEGORY
    : (categories[0]?.id ?? null);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
