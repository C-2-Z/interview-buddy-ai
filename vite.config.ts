import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => ({
  define: {
    "import.meta.env.VITE_APP_TARGET": JSON.stringify("web"),
    "import.meta.env.VITE_APP_PRODUCTION": JSON.stringify(mode === "production"),
  },
  plugins: [
    tanstackStart({
      server: { entry: "server" },
    }),
    viteReact(),
    tailwindcss(),
  ],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
    watch: {
      ignored: ["**/.runtime/**", "**/src-tauri/target/**"],
    },
  },
}));
