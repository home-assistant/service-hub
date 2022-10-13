import fetch from 'node-fetch';
import { Injectable } from '@nestjs/common';

export interface IntegrationData {
  title: string;
  quality_scale: string;
  iot_class: string;
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
