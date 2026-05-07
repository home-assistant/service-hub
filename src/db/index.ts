import { D1Adapter } from "./d1.js";
import type { Database } from "./types.js";

export type { Database };

export function createDatabase(d1: D1Database): Database {
  return new D1Adapter(d1);
}
