import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Provider, Notification } from '@parse/node-apn';

@Injectable()
export class ApnService {
  private apn: Provider;
  private topic: string;

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

  async sendNotification(payload: any, recipients: string | string[]): Promise<void> {
    const notification = new Notification(payload);
    notification.topic = this.topic;

    await this.apn.send(notification, recipients);
  }
}
