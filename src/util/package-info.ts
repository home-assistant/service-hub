import { createRequire } from "node:module";

// Node ESM only accepts JSON imports with `with { type: "json" }`, which
// tsc (module es2022) and swc don't both pass through; require() sidesteps
// that. Resolves from the repo root for src/ and dist/ alike (same depth).
const require = createRequire(import.meta.url);

export const packageJson: { version: string } = require("../../package.json");
