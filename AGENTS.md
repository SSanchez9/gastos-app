# Tarro (antes Gastos App / Boti)

Aplicación web responsive e instalable (PWA) para registrar gastos, ingresos, presupuestos, metas de ahorro, gastos fijos y carteras. Usa Firebase Authentication para iniciar sesión con Google y Cloud Firestore para sincronizar los datos de cada usuario. Se publica en GitHub Pages bajo `/gastos-app/`.

Idioma de la interfaz y de los textos de usuario: español (España). Importes con formato `1.717,27 €`.

## Stack y comandos

- HTML semántico, CSS moderno y TypeScript en modo estricto, empaquetados con Vite.
- Sin frameworks de interfaz. No añadas dependencias sin pedirlo antes.
- Firebase Authentication y Cloud Firestore para sesión y persistencia principal.
- PWA con `vite-plugin-pwa` (dependencia de desarrollo): el manifiesto y el service worker se configuran en `vite.config.ts`.
- Fuente Rubik alojada en `src/assets/fonts/` (licencia OFL); no se cargan fuentes de terceros.
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
- PWA: el service worker solo guarda la «carcasa» de cada versión (HTML, JS, CSS, fuente e iconos) para abrir la app sin conexión. No añadas reglas que guarden en caché peticiones a Firebase, Google Auth o Firestore. Sin datos cargados, `sync-ui.ts` muestra un aviso en lugar de estados vacíos.
- El service worker se registra en `main.ts` en modo «prompt»: una versión nueva no se activa sola, se muestra la barra «Hay una versión nueva» (`#update-bar`). La tarjeta «Instalar Tarro» (`#install-card`) usa `beforeinstallprompt` y, en iPhone, explica cómo añadirla desde Safari.
- Los iconos de la app están en `public/` y se generan a partir de `favicon.svg` (con esquinas) e `icon-maskable.svg` (fondo completo). Si cambias el icono, regenera todos los PNG con los mismos nombres.
- El acceso con Google usa popup a propósito: la app y `authDomain` están en dominios distintos, y la redirección falla en navegadores que aíslan el almacenamiento de terceros.
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
- Cabecera: selector de mes con flechas y botón para ocultar importes.
- Inicio: ahorro del mes con ingresos y gastado, presupuesto, próximo gasto fijo y meta, reparto del ingreso por categoría y últimos movimientos agrupados por día.
- Análisis: reparto del sueldo por categoría, ahorro de los últimos seis meses y desglose por categoría.
- Movimientos: lista del mes agrupada por día, filtro por categoría y botones de editar y eliminar en cada fila.
- Añadir o editar movimiento (diálogo): entrada rápida con vista previa y formulario completo.
- Más: ingresos, gastos fijos, carteras, metas, presupuestos, copias de seguridad JSON y CSV, cuenta, apariencia (modo claro u oscuro) e instalación de la app.
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
- Mobile-first. Modo claro y oscuro: el tema inicial sale de `prefers-color-scheme` y se puede cambiar desde Más; se aplica con `[data-theme]` en `<html>`.
- Todo color, radio, sombra, espaciado y tipografía como variables CSS (design tokens) en `src/styles/`. Sin valores sueltos en los componentes.
- Respeta `prefers-reduced-motion` en animaciones.
- No uses el color como única forma de transmitir un estado.
- Usa `aria-pressed` en botones de alternancia (por ejemplo, ocultar importes) y `aria-live` para mensajes de estado o error.
- Los iconos son SVG inline o sprite propio, con `aria-hidden` si son decorativos.

## Skills de interfaz
- Para decisiones visuales, usa frontend-design, respetando los tokens de `src/styles/base.css` y el
  estilo descrito en esta guía. Nunca inventes una estética distinta.
- Antes de entregar cambios de interfaz, pasa web-design-guidelines sobre los archivos modificados
  y corrige lo que señale.

## Dirección de diseño

Estilo «Sobremesa». Los tokens (claro y oscuro) están en `src/styles/base.css` y son la fuente de verdad. Las maquetas de exploración que llevaron a este estilo están en la rama `design-backup`, solo como referencia.

- Fondo melocotón muy claro; tarjetas blancas con esquinas redondeadas (14–32 px) y sombras suaves con tinte ciruela. Tipografía Rubik.
- Tarjeta principal ciruela con la cifra en azafrán, decimales más pequeños e ingresos y gastado a la derecha.
- Acento azafrán en las acciones principales (miel al pasar el ratón); lila para enlaces y elementos secundarios.
- Cada categoría tiene icono, tono de fondo y un color fijo en los gráficos (`--cat-*`); el ahorro siempre en azafrán. El color nunca va solo: siempre con nombre o icono.
- Listas de movimientos agrupadas por día: icono de categoría, título, subtítulo e importe (ingresos en verde con +, gastos con −).
- Móvil: navegación inferior flotante con el botón de añadir en el centro. Escritorio: barra lateral y grid con columna principal y columna de últimos movimientos.
- Icono de la app: «El guiño» (tarro con tapa ciruela sobre fondo lila).

Alcance en tareas de diseño: `index.html`, `src/styles/`, `src/ui.ts`, `src/auth-ui.ts`, `src/sync-ui.ts`, `src/charts.ts` y, solo para conectar eventos o IDs, `src/main.ts`. No toques `calc`, `format`, `io`, `backup`, `validate`, `types`, `storage`, `state`, `session` ni `src/firebase/`. Conserva todos los IDs y atributos que el código TypeScript enlaza.

## Estructura

- `src/main.ts`, `src/ui.ts`, `src/auth-ui.ts`, `src/sync-ui.ts`: arranque, eventos e interfaz.
- `src/types.ts`, `src/config.ts`, `src/validate.ts`: modelo, constantes y validación.
- `src/state.ts`, `src/session.ts`, `src/storage.ts`: estado, sesión y migración desde almacenamiento heredado.
- `src/firebase/`: cliente, autenticación, rutas, repositorio, mappers y sincronización con Firestore.
- `src/calc.ts`, `src/format.ts`, `src/charts.ts`: cálculos, formato y gráficos.
- `src/io.ts`, `src/backup.ts`: importación, exportación y copias de seguridad.
- `src/styles/`: `base.css` (tokens, tema y fuente), `layout.css` (estructura y navegación), `components.css` (piezas compartidas) y `screens.css` (estilos de cada pantalla).
- `src/assets/fonts/`: fuente Rubik y su licencia.
- `public/`: iconos de la PWA y favicon.
- `vite.config.ts`: base `/gastos-app/`, manifiesto y service worker.
- `tests/`: pruebas unitarias de cálculos, validación, importación, autenticación, sincronización y mappers.
- `design/reference/`: capturas de referencia de diseño (no forma parte de la app).