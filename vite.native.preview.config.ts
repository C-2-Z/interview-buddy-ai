/** Native 静态预览配置：只托管客户端目录，不加载 TanStack Start SSR preview 插件。 */
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist-native/client",
  },
});
