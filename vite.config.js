import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

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
