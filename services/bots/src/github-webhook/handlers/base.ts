import { Injectable } from '@nestjs/common';
import { EventType, Repository, WEBHOOK_HANDLERS } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';

@Injectable()
export class BaseWebhookHandler {
  public allowBots: boolean = true;
  public allowedEventTypes: EventType[] = [];
  public allowedRepositories: Repository[] = Object.values(Repository);

  constructor() {
    WEBHOOK_HANDLERS.push(this);
  }

  async handle(context: WebhookContext<any>) {}
}
