import { z } from "zod";
import { log } from "../log.js";
import { fetchWithTimeout } from "./fetch.js";

export enum QualityScale {
  NO_SCORE = "no score",
  LEGACY = "legacy",
  BRONZE = "bronze",
  SILVER = "silver",
  GOLD = "gold",
  PLATINUM = "platinum",
  INTERNAL = "internal",
}

const IntegrationManifestSchema = z.object({
  codeowners: z.array(z.string()).optional(),
  domain: z.string(),
  name: z.string(),
  quality_scale: z.nativeEnum(QualityScale).optional(),
  config_flow: z.boolean().default(false),
  dependencies: z.array(z.string()).default([]),
  documentation: z.string().default(""),
  requirements: z.array(z.string()).default([]),
  iot_class: z.string().default(""),
});

export type IntegrationManifest = z.infer<typeof IntegrationManifestSchema>;

export async function fetchIntegrationManifest(
  domain: string,
): Promise<IntegrationManifest | undefined> {
  try {
    const res = await fetchWithTimeout(
      `https://raw.githubusercontent.com/home-assistant/core/dev/homeassistant/components/${domain}/manifest.json`,
    );
    if (!res.ok) return;
    const parsed = IntegrationManifestSchema.safeParse(await res.json());
    if (!parsed.success) {
      log.warn("fetchIntegrationManifest: schema mismatch", {
        domain,
        issues: parsed.error.issues,
      });
      return;
    }
    return parsed.data;
  } catch (err) {
    log.warn("fetchIntegrationManifest: fetch failed", { domain, error: String(err) });
  }
}
