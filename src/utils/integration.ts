export enum QualityScale {
  NO_SCORE = "no score",
  SILVER = "silver",
  GOLD = "gold",
  PLATINUM = "platinum",
  INTERNAL = "internal",
}

export interface IntegrationManifest {
  codeowners?: string[];
  domain: string;
  name: string;
  quality_scale?: QualityScale;
  config_flow: boolean;
  dependencies: string[];
  documentation: string;
  requirements: string[];
  iot_class: string;
}

export async function fetchIntegrationManifest(
  domain: string,
): Promise<IntegrationManifest | undefined> {
  try {
    const res = await fetch(
      `https://raw.githubusercontent.com/home-assistant/core/dev/homeassistant/components/${domain}/manifest.json`,
    );
    if (!res.ok) return;
    return (await res.json()) as IntegrationManifest;
  } catch {
    // File doesn't exist or network error
  }
}
