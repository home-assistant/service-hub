import { On } from '@discord-nestjs/core';
import { Message, AttachmentBuilder } from 'discord.js';

const MAX_LINE_LENGTH = 17;

export class LineCountEnforcer {
  @On('messageCreate')
  async handler(message: Message): Promise<void> {
    if (message.content.split('\n').length > MAX_LINE_LENGTH) {
      const attachment = new AttachmentBuilder(Buffer.from(message.content, 'utf-8'), {
        name: 'message',
      });
      await message.channel.send({
        content: "I converted your message into a file since it's above 15 lines :+1:",
        files: [attachment],
      });
      await message.delete();
    }
  }
}
