import yaml from 'js-yaml';

import { Message, AttachmentBuilder, ChannelType, Events } from 'discord.js';
import { OnDiscordEvent } from '../../discord.decorator';

export const MAX_LINE_LENGTH = 17;
const KNOWN_FILETYPES = new Set([
  'diff',
  'javascript',
  'js',
  'json',
  'py',
  'python',
  'sh',
  'ts',
  'txt',
  'typescript',
  'yaml',
  'yml',
]);
const IGNORE_ROLES = new Set(['Admin', 'Mod']);

const formatedMessage = /^\`\`\`([a-z|A-Z]*)\n(.*)\n\`\`\`[\n]*$/s;

const contentIsValidJson = (content: string): boolean => {
  try {
    JSON.parse(content);
    return true;
  } catch (_) {
    return false;
  }
};

const contentIsValidYaml = (content: string): boolean => {
  try {
    yaml.load(content);
    return true;
  } catch (_) {
    return false;
  }
};

export class ListenerCommonLineCountEnforcer {
  @OnDiscordEvent({ event: Events.MessageCreate })
  async handler(message: Message): Promise<void> {
    if (
      !message.author.bot &&
      message.channel.type === ChannelType.GuildText &&
      !message.member.roles.cache.map((r) => r.name).find((role) => IGNORE_ROLES.has(role)) &&
      message.content.split('\n').length > MAX_LINE_LENGTH
    ) {
      let messageContent: string = message.content;
      let fileType = 'txt';
      if (formatedMessage.test(message.content)) {
        let [_, language, content] = formatedMessage.exec(message.content);
        if (!language && contentIsValidJson(content)) {
          language = 'json';
        } else if (!language && contentIsValidYaml(content)) {
          language = 'yaml';
        }
        fileType = language.toLowerCase();
        messageContent = content;
      }
      const attachment = new AttachmentBuilder(Buffer.from(messageContent, 'utf-8'), {
        name: `${[message.channel.name, message.author.username, message.id]
          .join('_')
          .toLowerCase()
          .replace(/-/g, '_')}.${KNOWN_FILETYPES.has(fileType) ? fileType : 'txt'}`,
      });
      await message.channel.send({
        content: `<@${message.author.id}> I converted your message into a file since it's above 15 lines :+1:`,
        files: [attachment],
      });
      await message.delete();
    }
  }
}
