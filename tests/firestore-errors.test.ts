import { describe, expect, it } from "vitest";
import { describeFirestoreError } from "../src/firebase/firestore-errors";

describe("describeFirestoreError", () => {
  it("traduce los códigos conocidos", () => {
    expect(describeFirestoreError({ code: "permission-denied" })).toMatch(/reglas/);
    expect(describeFirestoreError({ code: "unavailable" })).toMatch(/conexión/);
    expect(describeFirestoreError({ code: "resource-exhausted" })).toMatch(/cuota/);
    expect(describeFirestoreError({ code: "unauthenticated" })).toMatch(/sesión/);
  });

  it("acepta códigos con prefijo firestore/", () => {
    expect(describeFirestoreError({ code: "firestore/unavailable" })).toMatch(/conexión/);
  });

  it("usa un mensaje genérico para códigos desconocidos o errores sin código", () => {
    for (const error of [
      { code: "algo-raro" },
      new Error("x"),
      "texto",
      null,
      undefined,
    ]) {
      expect(describeFirestoreError(error)).toMatch(/No se pudo completar/);
    }
  });

  it("no se deja engañar por claves heredadas de los objetos", () => {
    expect(describeFirestoreError({ code: "constructor" })).toMatch(
      /No se pudo completar/,
    );
  });
});
