import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    name: "api",
    environment: "node",
    include: ["tests/api/**/*.test.ts", "tests/api/**/*.spec.ts"],
    globals: false,
    setupFiles: ["tests/setup/api.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "lcov", "html", "json-summary"],
      reportsDirectory: "test-reports/coverage/api",
      include: ["server/routes/**/*.ts", "server/app.ts"],
      exclude: ["**/*.test.ts", "**/node_modules/**", "**/routes-legacy.ts"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client/src"),
    },
  },
});
