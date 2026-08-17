import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Decorator metadata for NestJS DI
  plugins: [swc.vite()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      // Bootstrap-only modules: never loaded by the supertest app (which
      // builds AppModule directly); exercised by the /health smoke instead.
      exclude: ["src/main.ts", "src/instrument.ts"],
    },
  },
});
