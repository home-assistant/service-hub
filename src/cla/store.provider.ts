import type { Provider } from "@nestjs/common";
import { ENV, type Env } from "../env.js";
import { type ClaStore, dynamoClaStore } from "./store.js";

/**
 * Injection token for the CLA store. Resolves to `undefined` when the
 * DynamoDB settings are absent (CLA disabled) — consumers must handle it.
 */
export const CLA_STORE = Symbol("CLA_STORE");

export const claStoreProvider: Provider = {
  provide: CLA_STORE,
  useFactory: (env: Env): ClaStore | undefined => dynamoClaStore(env),
  inject: [ENV],
};
