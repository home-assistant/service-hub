import fetch from 'node-fetch';

export enum QualityScale {
  NO_SCORE = 'no score',
  SILVER = 'silver',
  GOLD = 'gold',
  PLATINUM = 'platinum',
  INTERNAL = 'internal',
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

export const fetchIntegrationManifest = async (
  domain: string,
): Promise<IntegrationManifest | undefined> => {
  try {
    const res = await fetch(
      `https://raw.githubusercontent.com/home-assistant/core/dev/homeassistant/components/${domain}/manifest.json`,
    );
    return await res.json();
  } catch (_) {
    // We expect errors when the file doesnt exist
  }
};
