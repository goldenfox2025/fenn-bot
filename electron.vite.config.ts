import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
const fenn = resolve("vendor/fenn/src");
const alias = {
  "@fenn-main": resolve(fenn, "main"),
  "@fenn-shared": resolve(fenn, "shared"),
  "@fenn-ui": resolve(fenn, "renderer/src"),
  "@shared": resolve(fenn, "shared"),
};
export default defineConfig({
  main: {
    resolve: { alias },
    plugins: [externalizeDepsPlugin()],
    define: {
      __OC_COMMIT__: '"local"',
      __OC_BUILT_AT__: '"local"',
      __OC_UPDATE_FEED__: '""',
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: { format: "cjs", entryFileNames: "[name].cjs" },
      },
    },
  },
  renderer: {
    root: "src/renderer",
    resolve: { alias, dedupe: ["react", "react-dom"] },
    plugins: [react()],
    server: { fs: { allow: [resolve("."), resolve(fenn, "renderer")] } },
  },
});
