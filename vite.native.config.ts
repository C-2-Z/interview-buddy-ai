/** Native SPA 构建配置：为 Capacitor 与 Tauri 生成不依赖 SSR 服务的静态客户端。 */
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => ({
  define: {
    "import.meta.env.VITE_APP_TARGET": JSON.stringify("native"),
    "import.meta.env.VITE_APP_PRODUCTION": JSON.stringify(mode === "production"),
  },
  plugins: [
    tanstackStart({
      server: { entry: "server" },
      spa: {
        enabled: true,
        prerender: {
          outputPath: "/index.html",
        },
      },
    }),
    viteReact(),
    tailwindcss(),
  ],
  resolve: {
    tsconfigPaths: true,
  },
  build: {
    outDir: "dist-native",
  },
}));
