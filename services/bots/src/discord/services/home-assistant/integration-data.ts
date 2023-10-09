import { Injectable } from '@nestjs/common';

export interface IntegrationData {
  title: string;
  description: string;
  quality_scale: 'no_score' | 'silver' | 'gold' | 'platinum' | 'internal';
  iot_class:
    | 'assumed_state'
    | 'cloud_polling'
    | 'cloud_push'
    | 'local_polling'
    | 'local_push'
    | 'calculated';
  integration_type:
    | 'device'
    | 'entity'
    | 'hardware'
    | 'helper'
    | 'hub'
    | 'service'
    | 'system'
    | 'virtual';
}

@Injectable()
export class ServiceHomeassistantIntegrationData {
  public data: { [key: string]: { [key: string]: IntegrationData } } = {};

  public async getIntegration(
    domain: string,
    channel?: 'stable' | 'beta',
  ): Promise<IntegrationData | undefined> {
    await this.ensureData();
    return this.data[channel || 'stable']?.[domain];
  }

  public async ensureData(force?: boolean, channel?: 'stable' | 'beta') {
    if (force || !this.data[channel || 'stable']) {
      this.data[channel || 'stable'] = await (
        await fetch(
          `https://${channel === 'beta' ? 'rc' : 'www'}.home-assistant.io/integrations.json`,
        )
      ).json();
    }
  }
}
