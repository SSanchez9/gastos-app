import { describe, expect, it } from "vitest";
import { describeReplacement, mergeAppData } from "../src/io";
import {
  checkSavingsAdjustment,
  checkSavingsBase,
  getSavingsOverview,
} from "../src/savings";
import type { AppData, Expense, SavingsAdjustment } from "../src/types";
import { parseAppData } from "../src/validate";

function expense(id: string, amountCents: number, date: string): Expense {
  return {
    id,
    amountCents,
    category: "otros",
    date,
    note: "",
    createdAt: 1,
    updatedAt: 1,
  };
}

function adjustment(
  id: string,
  kind: SavingsAdjustment["kind"],
  amountCents: number,
  date: string,
): SavingsAdjustment {
  return { id, kind, title: id, amountCents, date, createdAt: 1, updatedAt: 1 };
}

/** Sueldo de 2.000 € en jun, jul, ago y oct (septiembre sin sueldo). */
function sample(extra: Partial<AppData> = {}): AppData {
  return {
    version: 1,
    expenses: [
      expense("e1", 158000, "2026-06-10"), // sobra 420
      expense("e2", 144000, "2026-07-10"), // 560
      expense("e3", 212000, "2026-08-10"), // −120
      expense("e4", 30000, "2026-09-10"), // sin sueldo
      expense("e5", 149000, "2026-10-10"), // 510
    ],
    income: {
      byMonth: {
        "2026-06": 200000,
        "2026-07": 200000,
        "2026-08": 200000,
        "2026-10": 200000,
      },
    },
    savings: {
      baseCents: 800000,
      baseMonth: "2026-06",
      adjustments: [
        adjustment("regalo", "in", 15000, "2026-08-12"),
        adjustment("coche", "out", 10000, "2026-10-03"),
      ],
    },
    ...extra,
  };
}

describe("getSavingsOverview", () => {
  it("sin ahorro base devuelve null", () => {
    expect(getSavingsOverview({ ...sample(), savings: undefined }, "2026-10")).toBeNull();
  });

  it("suma la base, lo que sobra cada mes y los ajustes", () => {
    const overview = getSavingsOverview(sample(), "2026-10");
    expect(overview?.surplusCents).toBe(42000 + 56000 - 12000 + 51000);
    expect(overview?.adjustmentsCents).toBe(15000 - 10000);
    expect(overview?.totalCents).toBe(800000 + 137000 + 5000);
    expect(overview?.countedMonths).toBe(4);
    expect(overview?.monthSurplusCents).toBe(51000);
  });

  it("los meses sin sueldo no suman y se avisan", () => {
    const overview = getSavingsOverview(sample(), "2026-10");
    expect(overview?.missingIncomeMonths).toEqual(["2026-09"]);
  });

  it("solo cuenta hasta el mes elegido", () => {
    const overview = getSavingsOverview(sample(), "2026-07");
    expect(overview?.totalCents).toBe(800000 + 42000 + 56000);
    expect(overview?.adjustmentsCents).toBe(0);
  });

  it("los ajustes anteriores a la base no cuentan", () => {
    const data = sample();
    data.savings?.adjustments.push(adjustment("viejo", "in", 99900, "2026-05-30"));
    expect(getSavingsOverview(data, "2026-10")?.adjustmentsCents).toBe(5000);
  });

  it("antes de la base no hay total", () => {
    const overview = getSavingsOverview(sample(), "2026-05");
    expect(overview?.beforeBase).toBe(true);
    expect(overview?.history.every((month) => month.totalCents === null)).toBe(true);
  });

  it("el historial da el total al final de cada uno de los seis meses", () => {
    const history = getSavingsOverview(sample(), "2026-10")?.history ?? [];
    expect(history.map((item) => item.month)).toEqual([
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
    ]);
    expect(history.map((item) => item.totalCents)).toEqual([
      null,
      842000,
      898000,
      901000,
      901000,
      942000,
    ]);
    expect(history[4]?.surplusCents).toBeNull();
  });
});

describe("checkSavingsBase y checkSavingsAdjustment", () => {
  it("acepta una base de 0 y rechaza importes o meses no válidos", () => {
    expect(checkSavingsBase(0, "2026-06").ok).toBe(true);
    expect(checkSavingsBase(-1, "2026-06").ok).toBe(false);
    expect(checkSavingsBase(100, "2026-13").ok).toBe(false);
  });

  it("limpia el concepto y valida importe, tipo y fecha", () => {
    const base = {
      kind: "in" as const,
      title: "  Regalo   de  cumple ",
      amountCents: 500,
      date: "2026-11-18",
    };
    const checked = checkSavingsAdjustment(base);
    expect(checked.ok && checked.value.title).toBe("Regalo de cumple");
    expect(checkSavingsAdjustment({ ...base, amountCents: 0 }).ok).toBe(false);
    expect(checkSavingsAdjustment({ ...base, title: "   " }).ok).toBe(false);
    expect(checkSavingsAdjustment({ ...base, title: "a".repeat(61) }).ok).toBe(false);
    expect(checkSavingsAdjustment({ ...base, date: "2026-02-30" }).ok).toBe(false);
  });
});

describe("validación del ahorro", () => {
  it("los datos sin ahorro siguen siendo válidos", () => {
    const parsed = parseAppData({ version: 1, expenses: [], income: { byMonth: {} } });
    expect(parsed).not.toBeNull();
    expect(parsed?.savings).toBeUndefined();
  });

  it("lee un ahorro válido", () => {
    const data = sample();
    expect(parseAppData(data)?.savings).toEqual(data.savings);
  });

  it.each([
    ["base negativa", { baseCents: -1, baseMonth: "2026-06", adjustments: [] }],
    ["mes no válido", { baseCents: 0, baseMonth: "junio", adjustments: [] }],
    ["sin lista de ajustes", { baseCents: 0, baseMonth: "2026-06" }],
    [
      "ajuste con tipo desconocido",
      {
        baseCents: 0,
        baseMonth: "2026-06",
        adjustments: [{ ...adjustment("a", "in", 1, "2026-06-01"), kind: "otro" }],
      },
    ],
    [
      "ids repetidos",
      {
        baseCents: 0,
        baseMonth: "2026-06",
        adjustments: [
          adjustment("a", "in", 1, "2026-06-01"),
          adjustment("a", "out", 2, "2026-06-02"),
        ],
      },
    ],
  ])("rechaza %s", (_, savings) => {
    expect(
      parseAppData({ version: 1, expenses: [], income: { byMonth: {} }, savings }),
    ).toBeNull();
  });
});

describe("copias de seguridad", () => {
  it("al combinar conserva la base actual y añade los ajustes nuevos", () => {
    const current = sample();
    const incoming = sample({
      savings: {
        baseCents: 1,
        baseMonth: "2026-01",
        adjustments: [
          adjustment("regalo", "out", 1, "2026-08-12"),
          adjustment("herencia", "in", 50000, "2026-09-01"),
        ],
      },
    });
    const { data } = mergeAppData(current, incoming);
    expect(data.savings?.baseCents).toBe(800000);
    expect(data.savings?.adjustments.map((item) => item.id)).toEqual([
      "regalo",
      "coche",
      "herencia",
    ]);
    expect(data.savings?.adjustments[0]?.kind).toBe("in");
  });

  it("al combinar con una copia antigua se mantiene el ahorro", () => {
    const { data } = mergeAppData(sample(), { ...sample(), savings: undefined });
    expect(data.savings).toEqual(sample().savings);
  });

  it("al reemplazar avisa de lo que se borraría", () => {
    expect(
      describeReplacement(sample(), { ...sample(), savings: undefined }),
    ).toMatchObject({
      removedSavingsAdjustments: 2,
      removesSavingsBase: true,
    });
  });
});
