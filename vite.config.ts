import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // La web vivirá en https://ssanchez9.github.io/gastos-app/
  base: "/gastos-app/",
  build: {
    // El único archivo que supera los 500 kB es el de Firebase (≈ 555 kB, 167 kB
    // comprimido); el código de la app va aparte y pesa mucho menos.
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: {
        // Firebase va en su propio archivo: cambia poco, así que tras publicar una
        // versión nueva el navegador solo vuelve a descargar el código de la app.
        codeSplitting: {
          groups: [{ name: "firebase", test: /node_modules[\\/]@?firebase/ }],
        },
      },
    },
  },
  plugins: [
    VitePWA({
      // El service worker se registra a mano desde main.ts, con aviso de nueva
      // versión en lugar de recargar sola.
      injectRegister: false,
      registerType: "prompt",
      workbox: {
        // Se guarda en el dispositivo la «carcasa» de cada versión: HTML, JS, CSS,
        // fuente e iconos. No hay reglas para otros dominios, así que Firebase,
        // Google Auth y Firestore siguen yendo siempre a la red.
        globPatterns: ["**/*.{html,js,css,woff2,png,svg,webmanifest}"],
        globIgnores: ["icon-maskable.svg"],
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
