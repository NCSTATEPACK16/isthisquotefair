import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "IsThisQuoteFair",
        short_name: "QuoteFair",
        description: "Check a service quote against typical Wake County prices.",
        theme_color: "#0f172a",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
      },
      workbox: {
        // Never cache API / pipeline responses: verdicts live only in the tab (§5 step 7).
        navigateFallbackDenylist: [/^\/functions\//, /^\/rest\//, /^\/auth\//],
        runtimeCaching: [],
      },
    }),
  ],
});
