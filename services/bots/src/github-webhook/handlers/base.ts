import { Injectable } from '@nestjs/common';
import { WEBHOOK_HANDLERS } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';

@Injectable()
export class BaseWebhookHandler {
  constructor() {
    WEBHOOK_HANDLERS.push(this);
  }

  async handle(context: WebhookContext) {}
}
