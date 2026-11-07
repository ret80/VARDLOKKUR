import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Хост облачного превью (задаётся окружением при запуске dev-сервера).
// Позволяет открыть приложение через preview-домен, не ослабляя проверку Host.
const previewHost = process.env.__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS;

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  base: "/VARDLOKKUR/",
  server: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
    hmr: true,
    allowedHosts: previewHost ? previewHost.split(",").map((h) => h.trim()).filter(Boolean) : undefined,
  },
  build: {
    rollupOptions: {
      external: ['http', 'ws', 'buffer', 'url', 'path'],
    },
  },
  optimizeDeps: {
    exclude: ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
  },
});
