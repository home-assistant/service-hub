import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      // Calibrated to v8's counting, which is stricter than bun's coverage
      // was (same suite measured ~3 points lower on statements/branches).
      thresholds: {
        statements: 82,
        branches: 71,
        functions: 80,
        lines: 85,
      },
    },
  },
});
