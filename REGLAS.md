# Gastos App

App personal de control de gastos mensuales.

## Stack

- HTML5 semántico, CSS moderno (variables, grid, flexbox), TypeScript (strict) con Vite
- Sin frameworks. Persistencia en localStorage, solo en storage.ts
- Tests con Vitest, ESLint y Prettier

## Reglas

- Prohibido `any`; usa `unknown` y valida los datos importados
- Todo el modelo de datos vive en types.ts
- Importes en céntimos (enteros)
- El sueldo es variable: se guarda por mes (income.byMonth), sin valor por defecto.
  Si un mes no tiene sueldo, el ahorro es null y nunca se asume un valor
- Funciones puras en calc.ts y format.ts, sin tocar el DOM
- Accesibilidad: etiquetas, contraste AA, navegación por teclado
- Mobile-first, responsive, modo claro/oscuro con prefers-color-scheme
- Entrega los archivos completos, indicando el nombre de cada uno

## Estructura

src/: main, types, config, storage, state, calc, format, ui, charts, io, styles/
tests/: calc, format, io
