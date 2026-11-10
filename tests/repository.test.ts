import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Expense } from "../src/types";

const firestoreMocks = vi.hoisted(() => ({
  doc: vi.fn(() => ({})),
  updateDoc: vi.fn<(...args: unknown[]) => Promise<void>>(),
  deleteField: vi.fn(() => ({ kind: "delete-field" })),
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  deleteField: firestoreMocks.deleteField,
  deleteDoc: vi.fn(),
  doc: firestoreMocks.doc,
  onSnapshot: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: firestoreMocks.updateDoc,
  writeBatch: vi.fn(),
}));

vi.mock("../src/firebase/client", () => ({ getFirebaseDb: () => ({}) }));

import { updateExpense } from "../src/firebase/repository";

describe("updateExpense", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firestoreMocks.updateDoc.mockResolvedValue(undefined);
  });

  it("elimina walletId cuando el movimiento se guarda sin cartera", async () => {
    const expense: Expense = {
      id: "expense-1",
      amountCents: 1250,
      category: "supermercado",
      date: "2026-11-10",
      note: "Compra",
      createdAt: 1,
      updatedAt: 2,
    };

    const result = await updateExpense("user-1", expense);
    const update = firestoreMocks.updateDoc.mock.calls[0]?.[1] as
      Record<string, unknown> | undefined;

    expect(result.ok).toBe(true);
    expect(firestoreMocks.deleteField).toHaveBeenCalledOnce();
    expect(update?.["walletId"]).toEqual({ kind: "delete-field" });
  });
});
