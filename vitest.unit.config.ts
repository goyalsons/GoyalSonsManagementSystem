import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    name: "unit",
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.spec.ts"],
    globals: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "lcov", "html", "json-summary"],
      reportsDirectory: "test-reports/coverage/unit",
      include: ["server/lib/validation.ts", "server/lib/**/*.ts"],
      exclude: ["**/*.test.ts", "**/node_modules/**", "server/routes-legacy.ts"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client/src"),
    },
  },
});
