import { Injectable } from '@nestjs/common';

interface Redirect {
  redirect: string;
  deprecated?: boolean;
  custom?: boolean;
  name: string;
  badge?: string;
  description: string;
  introduced?: string;
  component?: string;
  params?: Record<string, string>;
}

@Injectable()
export class ServiceHomeassistantMyRedirectData {
  public data: Redirect[];

  public async getRedirect(redirect: string): Promise<Redirect | undefined> {
    await this.ensureData();
    return this.data.find((entry) => entry.redirect === redirect);
  }

  public async ensureData(force?: boolean) {
    if (force || !this.data?.length) {
      this.data = await (
        await fetch(
          'https://raw.githubusercontent.com/home-assistant/my.home-assistant.io/main/redirect.json',
        )
      ).json();
    }
  }
}
