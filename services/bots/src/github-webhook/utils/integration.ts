import fetch from 'node-fetch';

export enum QualityScale {
  NO_SCORE = 'No score',
  SILVER = 'Silver',
  GOLD = 'Gold',
  PLATINUM = 'Platinum',
  INTERNAL = 'Internal',
}

interface IntegrationManifest {
  codeowners: string[];
  domain: string;
  name: string;
  quality_scale?: QualityScale;
  config_flow: boolean;
  dependencies: string[];
  documentation: string;
  requirements: string[];
  iot_class: string;
}

export const fetchIntegrationManifest = async (domain: string): Promise<IntegrationManifest> =>
  await (
    await fetch(
      `https://raw.githubusercontent.com/home-assistant/core/dev/homeassistant/components/${domain}/manifest.json`,
    )
  ).json();
