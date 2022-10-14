import fetch from 'node-fetch';
import { Injectable } from '@nestjs/common';

export interface ComponentData {
  title: string;
  url: string;
  path: string;
  image?: string;
}

const SOURCES = {
  default: 'https://esphome.io/components.json',
  beta: 'https://beta.esphome.io/components.json',
};

const sourceWithFallback = (source: string) => (source in SOURCES ? source : 'default');

@Injectable()
export class ServiceEsphomeComponentData {
  public data: { [key: string]: { [key: string]: ComponentData } } = {};

  public async getComponent(
    channel: string,
    component: string,
  ): Promise<ComponentData | undefined> {
    const sourceName = sourceWithFallback(channel);
    await this.ensureData(sourceName);
    return this.data?.[sourceName]?.[component];
  }

  public async ensureData(channel: string, force?: boolean) {
    const sourceName = sourceWithFallback(channel);
    if (force || !this.data[sourceName]) {
      this.data[sourceName] = await (await fetch(SOURCES[sourceName])).json();
    }
  }
}
