import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // La web vivirá en https://ssanchez9.github.io/gastos-app/
  base: "/gastos-app/",
  plugins: [
    VitePWA({
      // El registro del service worker se hará a mano desde main.ts (fase 2),
      // con aviso de actualización en lugar de recargar sola (fase 4).
      injectRegister: false,
      registerType: "prompt",
      workbox: {
        // Se guarda en el dispositivo la «carcasa» de cada versión: HTML, JS, CSS,
        // fuente e iconos. No hay reglas para otros dominios, así que Firebase,
        // Google Auth y Firestore siguen yendo siempre a la red.
        globPatterns: ["**/*.{html,js,css,woff2,png,svg,webmanifest}"],
        globIgnores: ["icons.svg", "icon-maskable.svg"],
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: "Tarro · Control de gastos",
        short_name: "Tarro",
        description: "Controla tus gastos mensuales y cuánto ahorras.",
        lang: "es",
        start_url: "/gastos-app/",
        scope: "/gastos-app/",
        display: "standalone",
        background_color: "#fbf2ea",
        theme_color: "#fbf2ea",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          {
            src: "maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
});
