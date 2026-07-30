import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      input: {
        showcase: resolve(process.cwd(), "index.html"),
        neighborhood: resolve(process.cwd(), "demo/index.html"),
        mapArchitecture: resolve(process.cwd(), "map-architecture-mock.html")
      }
    }
  }
});

