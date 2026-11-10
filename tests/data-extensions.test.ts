import { describe, expect, it } from "vitest";
import { createLegacyIncomeMigration, getIncomeForMonth } from "../src/calc";
import { parseBackupText, serializeAppData } from "../src/io";
import { parseAppData } from "../src/validate";
import type { AppData } from "../src/types";

const base: AppData = {
  version: 1,
  expenses: [],
  income: { byMonth: { "2026-11": 180000 } },
};

describe("extensiones compatibles del modelo", () => {
  it("lee income.byMonth sin campos añadidos y valida los campos opcionales", () => {
    expect(parseAppData(base)).toEqual(base);
    expect(
      parseAppData({
        ...base,
        incomeEntries: [
          {
            id: "i1",
            title: "Nómina",
            amountCents: 180000,
            date: "2026-11-01",
            createdAt: 1,
            updatedAt: 1,
          },
        ],
        migratedIncomeMonths: ["2026-11"],
      }),
    ).not.toBeNull();
    expect(
      parseAppData({
        ...base,
        incomeEntries: [{ id: "bad", title: "", amountCents: -1 }],
      }),
    ).toBeNull();
  });

  it("migra de forma explícita, repetible y conserva income.byMonth", () => {
    const migration = createLegacyIncomeMigration(base, "2026-11", 10);
    expect(migration?.incomeEntries?.[0]?.amountCents).toBe(180000);
    expect(migration?.migratedIncomeMonths).toEqual(["2026-11"]);
    const migrated: AppData = { ...base, ...migration };
    expect(migrated.income.byMonth["2026-11"]).toBe(180000);
    expect(getIncomeForMonth(migrated, "2026-11")).toBe(180000);
    expect(createLegacyIncomeMigration(migrated, "2026-11", 20)).toBeNull();
  });

  it("exporta copias v2 e importa v1 y v2", () => {
    const v2 = serializeAppData(base);
    expect(JSON.parse(v2)).toMatchObject({ version: 2 });
    expect(parseBackupText(v2)).toEqual({ ok: true, value: base });
    expect(parseBackupText(JSON.stringify(base))).toEqual({ ok: true, value: base });
  });
});
