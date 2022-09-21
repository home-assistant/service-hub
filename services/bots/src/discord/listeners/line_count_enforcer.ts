import { On } from '@discord-nestjs/core';
import { Message, AttachmentBuilder } from 'discord.js';

export const MAX_LINE_LENGTH = 17;
const KNOWN_FILETYPES = new Set([
  'javascript',
  'js',
  'json',
  'ts',
  'txt',
  'typescript',
  'yaml',
  'yml',
]);

const formatedMessage = /^\`\`\`([a-z|A-Z]*)\n(.*)\n\`\`\`[\n]*$/s;

export class LineCountEnforcer {
  @On('messageCreate')
  async handler(message: Message): Promise<void> {
    if (message.content.split('\n').length > MAX_LINE_LENGTH) {
      let messageContent: string = message.content;
      let fileType = 'txt';
      if (formatedMessage.test(message.content)) {
        const [_, language, content] = formatedMessage.exec(message.content);
        fileType = language;
        messageContent = content;
      }
      const attachment = new AttachmentBuilder(Buffer.from(messageContent, 'utf-8'), {
        name: `message.${
          KNOWN_FILETYPES.has(fileType.toLowerCase()) ? fileType.toLowerCase() : 'txt'
        }`,
      });
      await message.channel.send({
        content: "I converted your message into a file since it's above 15 lines :+1:",
        files: [attachment],
      });
      await message.delete();
    }
  }
}
