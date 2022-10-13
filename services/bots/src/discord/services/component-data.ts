import fetch from 'node-fetch';
import { Injectable } from '@nestjs/common';

export interface ComponentData {
  title: string;
  url: string;
}

const SOURCES = {
  default: 'https://esphome.io/components.json',
};

@Injectable()
export class ComponentDataService {
  public data: { [key: string]: { [key: string]: ComponentData } } = {};

  public async getComponent(
    channel: string,
    component: string,
  ): Promise<ComponentData | undefined> {
    await this.ensureData(channel);
    return this.data?.[channel]?.[component];
  }

  public async ensureData(channel: string, force?: boolean) {
    if (force || !this.data[channel]) {
      this.data[channel] = await (await fetch(SOURCES[channel] || SOURCES.default)).json();
    }
  }
}
