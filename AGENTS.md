# Gastos App (Boti)

Aplicación web responsive para registrar gastos, ingresos, presupuestos, metas de ahorro, gastos fijos y carteras. Usa Firebase Authentication para iniciar sesión con Google y Cloud Firestore para sincronizar los datos de cada usuario.

Idioma de la interfaz y de los textos de usuario: español (España). Importes con formato `1.717,27 €`.

## Stack y comandos

- HTML semántico, CSS moderno y TypeScript en modo estricto, empaquetados con Vite.
- Sin frameworks de interfaz. No añadas dependencias sin pedirlo antes.
- Firebase Authentication y Cloud Firestore para sesión y persistencia principal.
- Vitest, ESLint y Prettier para calidad de código.

Comandos habituales:

- `npm run dev`: servidor local.
- `npm run build`: comprobación de tipos y compilación de producción.
- `npm run lint`: reglas de ESLint.
- `npm run format:check`: comprueba el formato.
- `npm test`: ejecuta Vitest.
- `npm run check`: ejecuta tipos, lint, formato y tests.

## Arquitectura y persistencia

- `src/types.ts` es la fuente común de los tipos del modelo de datos.
- `src/state.ts` mantiene el estado de la aplicación, valida cuándo se puede escribir y coordina la sincronización.
- El acceso a Firestore se implementa en `src/firebase/repository.ts`. Mantén fuera de los componentes las lecturas y escrituras directas de Firestore.
- `src/firebase/paths.ts` define las rutas de Firestore; `mappers.ts` convierte y valida documentos; `diff.ts` calcula cambios para importar copias.
- Los movimientos y los ingresos mensuales se guardan bajo `users/{uid}/expenses` y `users/{uid}/monthlyIncomes`. Los presupuestos, metas, gastos fijos, carteras y traspasos se guardan en `users/{uid}/finance/settings`.
- `src/firebase/auth.ts` gestiona el acceso con Google; `src/session.ts` representa la sesión en la aplicación.
- `src/firebase/config.ts` contiene la configuración cliente de Firebase. La clave web de Firebase no sustituye las reglas de seguridad: los datos deben protegerse en Firestore Rules y limitarse al usuario autenticado correspondiente.
- El inicio de sesión abre Google mediante popup. `watchAuthState` actualiza `session.ts`; cuando hay usuario, `main.ts` inicia `state.startSync(uid)`. Al cerrar sesión se detienen las escuchas y se limpia el estado en memoria.
- `state.startSync` espera las tres suscripciones de `repository.ts` (gastos, ingresos mensuales y ajustes financieros) antes de marcar los datos como listos. Los cambios remotos vuelven a renderizar la interfaz.
- Las escrituras pasan por acciones de `state.ts` y `repository.ts`; comprueba sesión, carga completa y conexión. Presenta errores de Firebase traducidos y permite reintentar la carga.
- La aplicación requiere conexión para escribir. No presupongas persistencia offline en disco: el cliente de Firestore usa memoria.
- `src/storage.ts` solo lee datos heredados de `localStorage` para ofrecer su importación a Firestore. No añadas ahí una segunda fuente de persistencia para datos nuevos.
- Las copias JSON y CSV se gestionan en `src/backup.ts` e `src/io.ts`. Los archivos importados y los documentos recibidos de Firestore deben validarse antes de incorporarlos al estado.
- Los campos financieros añadidos de forma compatible pueden ser opcionales en copias antiguas. Si un cambio rompe el formato existente, aumenta la versión del esquema y añade una migración explícita; no descartes datos antiguos silenciosamente.
- No subas secretos ni claves privadas al repositorio.

## Protección de la base de datos existente

La base de datos de producción (Firestore, `users/{uid}/...`) contiene datos reales y no se puede perder ni corromper.

- Todo cambio debe ser compatible hacia atrás: los documentos que ya existen deben seguir leyéndose sin errores.
- Prohibido renombrar, mover o eliminar colecciones, documentos o campos existentes.
- Prohibido cambiar el tipo o el significado de un campo existente (por ejemplo, los importes siguen siendo céntimos enteros).
- Solo se pueden AÑADIR campos nuevos, y deben ser opcionales con un valor por defecto seguro en el mapper. Si falta un campo nuevo en un documento antiguo, la app funciona igual.
- Si algo exige un cambio incompatible, no lo hagas: describe el problema, propón una migración explícita y espera mi confirmación.
- Ninguna migración se ejecuta sola al arrancar la app sobre datos reales sin que yo lo apruebe. Si hay migración, debe ser idempotente (se puede repetir sin duplicar ni perder nada), no destructiva (no borra el dato antiguo) y estar cubierta por tests.
- No escribas datos de prueba, ejemplo o semilla en la base de datos real. Los tests y las maquetas usan datos ficticios en memoria.
- No ejecutes comandos que modifiquen Firebase (`firebase deploy`, importaciones, borrados). Solo código local.
- Las copias de seguridad JSON/CSV antiguas deben seguir importándose.

## Reglas de implementación

- No uses `any`. Trata datos externos como `unknown` y valida su forma antes de usarlos.
- Todo cambio al modelo debe reflejarse en `types.ts`, en los validadores y mappers afectados, en la persistencia y en la importación/exportación de copias.
- Guarda importes como enteros en céntimos. Convierte a euros solo al mostrar o leer valores de formularios.
- El sueldo es variable y se guarda por mes en `income.byMonth`; no hay un sueldo por defecto. Si falta el sueldo de un mes, el ahorro de ese mes es `null` y la interfaz muestra "—" o un estado vacío claro. Nunca se asume un valor.
- Mantén `calc.ts` y `format.ts` como módulos puros, sin acceso al DOM ni a Firebase. El formateo de importes, fechas y porcentajes solo ocurre en `format.ts`.
- Conserva `state.ts` como vía para actualizar el estado y coordinar escrituras. La interfaz debe reflejar los cambios recibidos por la suscripción de Firestore.
- No permitas escrituras antes de que termine la carga inicial, sin sesión o sin conexión; presenta errores de sincronización con una acción clara para recuperarse.
- Los traspasos entre carteras no cuentan como gasto ni como ingreso. Los gastos asignados a una cartera deben actualizar su saldo derivado.
- Al combinar copias, conserva los datos actuales ante conflictos según las reglas de `io.ts`; al reemplazar, informa qué datos se eliminarán.
- No inventes datos, funciones ni cifras en la interfaz real (ni rentabilidades, ni cuentas, ni textos de relleno).

## Secciones de la aplicación

La interfaz principal se define en `index.html`; `ui.ts` renderiza los datos y `main.ts` conecta los eventos. Mantén consistentes los destinos de navegación, los títulos accesibles y los identificadores usados por el código.

- Acceso con Google, visible cuando no hay una sesión activa.
- Navegación lateral en escritorio y barra inferior en móvil: Inicio, Movimientos, Análisis y Más, con una acción destacada para añadir.
- Inicio: resumen del mes, ingresos, presupuesto, metas, gastos fijos y carteras.
- Análisis: gastos por categoría, tendencia de ahorro y desglose mensual.
- Movimientos: entrada rápida, formulario de alta y edición, filtros y lista del mes.
- Más: exportación e importación de copias JSON y CSV.
- El mes seleccionado determina el resumen, los movimientos, los ingresos, el presupuesto y los análisis mensuales; las metas de ahorro no dependen del mes. Los formularios deben conservar el contexto necesario al añadir varios movimientos.

## Flujo de trabajo para cambios

- Antes de modificar, revisa el módulo responsable y sus consumidores; evita duplicar persistencia o lógica de renderizado.
- Para una función de datos, sigue el recorrido completo: tipos, validación, acción de estado, repositorio/mappers, sincronización, UI y copias de seguridad. Actualiza la versión o migración si cambia el formato de forma incompatible.
- Para una sección o interacción, conserva los IDs enlazados desde TypeScript, los atributos accesibles y los destinos de navegación en móvil y escritorio.
- Añade o adapta pruebas Vitest para cambios de lógica y datos. Antes de entregar, ejecuta `npm run build`; ejecuta también lint, formato y tests cuando el cambio afecte esas áreas.
- No edites credenciales ni reglas de Firebase (`firestore.rules`) por suposición. Si propones un cambio de reglas, muéstralo aparte y explica el motivo. Mantén la autorización por usuario en el backend.
- No modifiques los tests existentes para que pasen. Si un test debe cambiar, explícalo y pide confirmación.
- Antes de una tarea grande, lista los archivos que vas a tocar. Cambios enfocados, sin refactorizar lo que no forme parte de la tarea.
- Entrega los archivos completos, indicando el nombre de cada uno, y termina con un resumen: qué cambió, qué no se tocó y cómo comprobarlo.
- Si una petición contradice estas reglas, avísame antes de hacerla.

## Interfaz y accesibilidad

- Usa HTML semántico, etiquetas visibles, nombres accesibles para controles y navegación completa con teclado.
- Mantén contraste AA, foco visible, objetivos táctiles cómodos y estados de carga, error y vacío comprensibles.
- La interfaz debe funcionar desde móvil hasta escritorio (≥ 1024 px con layout propio), respetar las áreas seguras del móvil y evitar el desplazamiento horizontal.
- Mobile-first. Modo claro y oscuro con `prefers-color-scheme`.
- Todo color, radio, sombra, espaciado y tipografía como variables CSS (design tokens) en `src/styles/`. Sin valores sueltos en los componentes.
- Respeta `prefers-reduced-motion` en animaciones.
- No uses el color como única forma de transmitir un estado.
- Usa `aria-pressed` en botones de alternancia (por ejemplo, ocultar importes) y `aria-live` para mensajes de estado o error.
- Los iconos son SVG inline o sprite propio, con `aria-hidden` si son decorativos.

## Dirección de diseño

Referencia visual en `design/reference/` (imagen móvil "Style 2 · Dark Card" y captura actual de escritorio):

- Fondo verde-grisáceo muy claro; contenedores blancos con esquinas muy redondeadas (20–28 px) y sombras suaves.
- Tarjeta principal oscura (verde bosque) con el balance grande, decimales más pequeños y botón de ojo para ocultar importes.
- Acento verde lima en botones secundarios y detalles.
- Fila de acciones rápidas con iconos circulares.
- Lista de actividad reciente: icono circular, título, subtítulo e importe (ingresos en verde con +, gastos en oscuro con −).
- Móvil: navegación inferior flotante. Escritorio: barra lateral y grid con columna principal y columna de actividad reciente.

Alcance en tareas de diseño: `index.html`, `src/styles/`, `src/ui.ts`, `src/auth-ui.ts`, `src/sync-ui.ts`, `src/charts.ts` y, solo para conectar eventos o IDs, `src/main.ts`. No toques `calc`, `format`, `io`, `backup`, `validate`, `types`, `storage`, `state`, `session` ni `src/firebase/`. Conserva todos los IDs y atributos que el código TypeScript enlaza.

## Estructura

- `src/main.ts`, `src/ui.ts`, `src/auth-ui.ts`, `src/sync-ui.ts`: arranque, eventos e interfaz.
- `src/types.ts`, `src/config.ts`, `src/validate.ts`: modelo, constantes y validación.
- `src/state.ts`, `src/session.ts`, `src/storage.ts`: estado, sesión y migración desde almacenamiento heredado.
- `src/firebase/`: cliente, autenticación, rutas, repositorio, mappers y sincronización con Firestore.
- `src/calc.ts`, `src/format.ts`, `src/charts.ts`: cálculos, formato y gráficos.
- `src/io.ts`, `src/backup.ts`: importación, exportación y copias de seguridad.
- `src/styles/`: estilos base, componentes, layout y tema.
- `tests/`: pruebas unitarias de cálculos, validación, importación, autenticación, sincronización y mappers.
- `design/`: maquetas, capturas y referencias de diseño (no forma parte de la app).