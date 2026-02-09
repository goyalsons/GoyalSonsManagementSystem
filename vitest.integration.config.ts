import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    name: "integration",
    environment: "node",
    include: ["tests/integration/**/*.test.ts", "tests/integration/**/*.spec.ts"],
    globals: false,
    setupFiles: ["tests/setup/integration.ts"],
    testTimeout: 15000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "lcov", "html", "json-summary"],
      reportsDirectory: "test-reports/coverage/integration",
      include: ["server/lib/**/*.ts", "prisma/seed.ts"],
      exclude: ["**/*.test.ts", "**/node_modules/**"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client/src"),
    },
  },
});
