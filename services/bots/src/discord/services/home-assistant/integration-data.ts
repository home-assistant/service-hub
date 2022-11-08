import fetch from 'node-fetch';
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
  integration_type: 'hub' | 'device' | 'service';
}

@Injectable()
export class ServiceHomeassistantIntegrationData {
  public data: { [key: string]: IntegrationData };

  public async getIntegration(domain: string): Promise<IntegrationData | undefined> {
    await this.ensureData();
    return this.data?.[domain];
  }

  public async ensureData(force?: boolean) {
    if (force || !this.data) {
      this.data = await (await fetch('https://www.home-assistant.io/integrations.json')).json();
    }
  }
}
