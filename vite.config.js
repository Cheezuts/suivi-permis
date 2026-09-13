import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Base relative ('./') : fonctionne à la racine d'un domaine
// comme dans un sous-dossier GitHub Pages (https://<user>.github.io/<repo>/)
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Sépare recharts (la plus grosse dépendance) dans son propre chunk,
        // mis en cache indépendamment du reste du code applicatif.
        manualChunks: {
          recharts: ["recharts"],
        },
      },
    },
  },
});
