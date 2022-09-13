import { DiscordCommand } from '../discord.decorator';
import { BaseDiscordCommand } from './base';

@DiscordCommand({
  name: 'ping',
  description: 'Returns pong',
})
export class PingCommand extends BaseDiscordCommand<any> {
  async handleCommand(): Promise<string> {
    return 'pong';
  }
}
