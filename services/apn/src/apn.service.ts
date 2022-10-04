import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Provider, Notification } from '@parse/node-apn';
import { defaultRatelimitValues } from './apn.const';
import { RateLimit } from './apn.model';

@Injectable()
export class ApnService {
  private apn: Provider;
  private topic: string;
  private rateLimits: Record<string, RateLimit> = {};

  constructor(private configService: ConfigService) {
    this.topic = configService.get('apn.topic');
    this.apn = new Provider({
      token: {
        key: configService.get('apn.certificate'),
        keyId: configService.get('apn.keyId'),
        teamId: configService.get('apn.teamId'),
      },
      production: configService.get('env') === 'production',
    });
  }

  getRatelimit(deviceId: string): RateLimit {
    return { ...defaultRatelimitValues(), ...this.rateLimits[deviceId] };
  }

  async sendNotification(payload: any, recipients: string | string[]): Promise<void> {
    const notification = new Notification(payload);
    notification.topic = this.topic;

    await this.apn.send(notification, recipients);
  }
}
