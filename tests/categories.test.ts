import { describe, expect, it } from "vitest";
import {
  builtInCategory,
  createCategory,
  findCategory,
  getCategories,
  guessCategoryFromText,
  guessCategoryIcon,
  nextCategoryColor,
  planCategoryDeletion,
} from "../src/categories";
import { isCategoryKey } from "../src/config";
import { documentToExpense } from "../src/firebase/mappers";
import { expensesToCsv, mergeAppData } from "../src/io";
import type { AppData, Expense, RecurringExpense, UserCategory } from "../src/types";
import { parseAppData } from "../src/validate";

const CUSTOM_ID = "cat-1234abcd-5678";

function makeExpense(overrides: Partial<Expense> & Pick<Expense, "id">): Expense {
  return {
    amountCents: 1000,
    category: "otros",
    date: "2026-11-10",
    note: "",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function makeRecurring(overrides: Partial<RecurringExpense>): RecurringExpense {
  return {
    id: "r1",
    name: "Gimnasio",
    amountCents: 3500,
    category: "personal",
    dayOfMonth: 1,
    active: true,
    lastRunMonth: null,
    ...overrides,
  };
}

function makeData(overrides: Partial<AppData> = {}): AppData {
  return { version: 1, expenses: [], income: { byMonth: {} }, ...overrides };
}

const gym: UserCategory = {
  id: CUSTOM_ID,
  name: "Gimnasio",
  icon: "heart",
  color: "plum",
  createdAt: 5,
};

describe("isCategoryKey", () => {
  it("acepta las de siempre y las creadas con formato cat-", () => {
    expect(isCategoryKey("supermercado")).toBe(true);
    expect(isCategoryKey(CUSTOM_ID)).toBe(true);
  });

  it("sigue rechazando texto libre y formatos incompletos", () => {
    for (const value of [
      "comida",
      "inventada",
      "cat-",
      "cat-abc",
      "CAT-12345678",
      3,
      null,
    ])
      expect(isCategoryKey(value)).toBe(false);
  });
});

describe("getCategories", () => {
  it("una persona nueva empieza con Social, Otros, Casa y Personal", () => {
    expect(getCategories(makeData()).map((category) => category.id)).toEqual([
      "personal",
      "casa",
      "otros",
      "social",
    ]);
  });

  it("sin lista guardada añade las de siempre que ya se usan, sin escribir nada", () => {
    const data = makeData({
      expenses: [makeExpense({ id: "a", category: "gasolina" })],
      recurring: [makeRecurring({ category: "alquiler" })],
    });
    expect(getCategories(data).map((category) => category.id)).toEqual([
      "personal",
      "gasolina",
      "alquiler",
      "casa",
      "otros",
      "social",
    ]);
    expect(data.categories).toBeUndefined();
  });

  it("con lista guardada la usa tal cual", () => {
    const categories = [builtInCategory("casa"), gym];
    expect(getCategories(makeData({ categories }))).toBe(categories);
  });
});

describe("findCategory", () => {
  it("encuentra la categoría o recurre a la de siempre o a «Sin categoría»", () => {
    expect(findCategory([gym], CUSTOM_ID).name).toBe("Gimnasio");
    expect(findCategory([], "supermercado").name).toBe("Supermercado");
    expect(findCategory([], "cat-desconocida-1").name).toBe("Sin categoría");
  });
});

describe("icono y color automáticos", () => {
  it("elige el icono por el nombre, sin tildes ni mayúsculas", () => {
    expect(guessCategoryIcon("Supermercado Día")).toBe("cart");
    expect(guessCategoryIcon("Viajes")).toBe("plane");
    expect(guessCategoryIcon("Farmacia y salud")).toBe("heart");
    expect(guessCategoryIcon("Educación")).toBe("book");
    expect(guessCategoryIcon("Mascotas")).toBe("tag");
  });

  it("usa el primer color libre y, si no queda, el menos usado", () => {
    expect(nextCategoryColor([])).toBe("plum");
    expect(
      nextCategoryColor([builtInCategory("alquiler"), builtInCategory("coche")]),
    ).toBe("green");
    const all = (
      [
        "alquiler",
        "coche",
        "social",
        "casa",
        "supermercado",
        "personal",
        "gasolina",
        "otros",
      ] as const
    ).map(builtInCategory);
    expect(nextCategoryColor([...all, { ...gym, color: "plum" }])).toBe("orange");
  });
});

describe("createCategory", () => {
  it("crea la categoría con icono y color automáticos", () => {
    const created = createCategory("  Viajes  ", [], CUSTOM_ID, 9);
    expect(created).toEqual({
      ok: true,
      value: {
        id: CUSTOM_ID,
        name: "Viajes",
        icon: "plane",
        color: "plum",
        createdAt: 9,
      },
    });
  });

  it("rechaza nombres vacíos, demasiado largos o repetidos", () => {
    expect(createCategory("   ", [], CUSTOM_ID, 1).ok).toBe(false);
    expect(createCategory("x".repeat(41), [], CUSTOM_ID, 1).ok).toBe(false);
    expect(createCategory("gimnásio", [gym], "cat-otraotra-1", 1).ok).toBe(false);
    expect(createCategory("SOCIAL", [builtInCategory("social")], CUSTOM_ID, 1).ok).toBe(
      false,
    );
  });
});

describe("planCategoryDeletion", () => {
  const base = [builtInCategory("personal"), builtInCategory("otros"), gym];

  it("pasa a «Otros» los movimientos y gastos fijos de la categoría", () => {
    const data = makeData({
      categories: base,
      expenses: [
        makeExpense({ id: "a", category: CUSTOM_ID }),
        makeExpense({ id: "b", category: "personal" }),
        makeExpense({ id: "c", category: CUSTOM_ID }),
      ],
      recurring: [makeRecurring({ id: "r1", category: CUSTOM_ID })],
    });
    const plan = planCategoryDeletion(data, CUSTOM_ID);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.value.expenseIds).toEqual(["a", "c"]);
    expect(plan.value.movedRecurring).toBe(1);
    expect(plan.value.recurring[0]?.category).toBe("otros");
    expect(plan.value.categories.map((category) => category.id)).toEqual([
      "personal",
      "otros",
    ]);
  });

  it("vuelve a crear «Otros» si se había borrado y hay movimientos que mover", () => {
    const data = makeData({
      categories: [builtInCategory("personal"), gym],
      expenses: [makeExpense({ id: "a", category: CUSTOM_ID })],
    });
    const plan = planCategoryDeletion(data, CUSTOM_ID);
    expect(plan.ok && plan.value.categories.map((category) => category.id)).toEqual([
      "personal",
      "otros",
    ]);
  });

  it("no añade «Otros» si la categoría no tenía movimientos", () => {
    const data = makeData({ categories: [builtInCategory("personal"), gym] });
    const plan = planCategoryDeletion(data, CUSTOM_ID);
    expect(plan.ok && plan.value.categories.map((category) => category.id)).toEqual([
      "personal",
    ]);
  });

  it("solo deja borrar «Otros» si no tiene movimientos", () => {
    const withMovements = makeData({
      categories: base,
      expenses: [makeExpense({ id: "a", category: "otros" })],
    });
    expect(planCategoryDeletion(withMovements, "otros").ok).toBe(false);
    expect(planCategoryDeletion(makeData({ categories: base }), "otros").ok).toBe(true);
  });

  it("no deja borrar la última categoría ni una que no existe", () => {
    expect(planCategoryDeletion(makeData({ categories: [gym] }), CUSTOM_ID).ok).toBe(
      false,
    );
    expect(planCategoryDeletion(makeData({ categories: base }), "coche").ok).toBe(false);
  });
});

describe("guessCategoryFromText", () => {
  const categories = [builtInCategory("supermercado"), builtInCategory("otros"), gym];

  it("reconoce el nombre de una categoría de la persona", () => {
    expect(guessCategoryFromText("35 gimnasio", categories)).toBe(CUSTOM_ID);
  });

  it("usa palabras habituales solo si esa categoría está en la lista", () => {
    expect(guessCategoryFromText("45 mercadona ayer", categories)).toBe("supermercado");
    expect(guessCategoryFromText("30 gasolina", categories)).toBe("otros");
  });

  it("sin «Otros» recurre a la primera categoría", () => {
    expect(guessCategoryFromText("12 algo", [gym])).toBe(CUSTOM_ID);
    expect(guessCategoryFromText("12 algo", [])).toBeNull();
  });
});

describe("datos con categorías", () => {
  it("parseAppData acepta categorías y movimientos de categorías creadas", () => {
    const parsed = parseAppData(
      makeData({
        categories: [builtInCategory("otros"), gym],
        expenses: [makeExpense({ id: "a", category: CUSTOM_ID })],
      }),
    );
    expect(parsed?.categories).toEqual([builtInCategory("otros"), gym]);
    expect(parsed?.expenses[0]?.category).toBe(CUSTOM_ID);
  });

  it("parseAppData rechaza categorías mal formadas o repetidas", () => {
    const bad: unknown[] = [
      { ...gym, id: "gimnasio" },
      { ...gym, name: "  " },
      { ...gym, icon: "cohete" },
      { ...gym, color: "#ff0000" },
    ];
    for (const category of bad)
      expect(parseAppData({ ...makeData(), categories: [category] })).toBeNull();
    expect(parseAppData(makeData({ categories: [gym, gym] }))).toBeNull();
  });

  it("los datos sin lista de categorías se siguen leyendo igual", () => {
    expect(parseAppData(makeData())?.categories).toBeUndefined();
  });

  it("documentToExpense acepta movimientos de categorías creadas", () => {
    const expense = documentToExpense("a", {
      amountCents: 1200,
      category: CUSTOM_ID,
      date: "2026-11-10",
      note: "",
      createdAt: 1,
      updatedAt: 1,
    });
    expect(expense?.category).toBe(CUSTOM_ID);
  });

  it("el CSV usa el nombre de la categoría de la persona", () => {
    const csv = expensesToCsv([makeExpense({ id: "a", category: CUSTOM_ID })], [gym]);
    expect(csv).toContain("2026-11-10;Gimnasio;;10,00");
  });

  it("al combinar copias se conservan las categorías actuales y se añaden las nuevas", () => {
    const current = makeData({
      expenses: [makeExpense({ id: "a", category: "gasolina" })],
    });
    const incoming = makeData({
      categories: [{ ...builtInCategory("social"), name: "Amigos" }, gym],
    });
    const merged = mergeAppData(current, incoming).data.categories;
    expect(merged?.map((category) => category.id)).toEqual([
      "personal",
      "gasolina",
      "casa",
      "otros",
      "social",
      CUSTOM_ID,
    ]);
    expect(merged?.find((category) => category.id === "social")?.name).toBe("Social");
  });

  it("si ninguna copia tiene lista, al combinar no se crea una", () => {
    expect(mergeAppData(makeData(), makeData()).data.categories).toBeUndefined();
  });
});
