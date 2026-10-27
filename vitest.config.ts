import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
const fenn = resolve("vendor/fenn/src");
export default defineConfig({
  resolve: {
    alias: {
      "@fenn-main": resolve(fenn, "main"),
      "@fenn-shared": resolve(fenn, "shared"),
      "@shared": resolve(fenn, "shared"),
    },
  },
  test: { include: ["test/**/*.test.ts"], testTimeout: 20000 },
});
