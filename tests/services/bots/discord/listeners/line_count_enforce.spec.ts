// @ts-nocheck
import * as assert from 'assert';
import { Message, ChannelType } from 'discord.js';

import {
  MAX_LINE_LENGTH,
  ListenerCommonLineCountEnforcer,
} from '../../../../../services/bots/src/discord/listeners/common/line_count_enforcer';

describe('ListenerCommonLineCountEnforcer', () => {
  let listener: ListenerCommonLineCountEnforcer;
  let mockMessage: Message;
  let sendMessage: any;

  beforeEach(function () {
    listener = new ListenerCommonLineCountEnforcer();
    sendMessage = {};
    mockMessage = {
      content: '',
      author: { bot: false, id: '1337' },
      member: {
        roles: {
          cache: [{}],
        },
      },
      channel: {
        // @ts-ignore
        async send(content) {
          sendMessage = content;
        },
        type: ChannelType.GuildText,
        isTextBased() {
          return true;
        },
      },
      // @ts-ignore
      delete: (val) => val,
    };
  });

  it('Content is large', async () => {
    mockMessage.content = [...Array(MAX_LINE_LENGTH + 1).keys()].map(() => `hi`).join('\n');
    await listener.handler(mockMessage);
    assert.deepStrictEqual(
      sendMessage.content,
      `<@${mockMessage.author.id}> I converted your message into a file since it's above 15 lines :+1:`,
    );
    assert.deepStrictEqual(sendMessage.files[0].name, 'message.txt');
  });
  it('Content is not large', async () => {
    mockMessage.content = [...Array(MAX_LINE_LENGTH).keys()].map(() => `hi`).join('\n');
    await listener.handler(mockMessage);
    assert.deepStrictEqual(sendMessage.content, undefined);
  });

  it('Content is large and language is yaml', async () => {
    mockMessage.content =
      '```yaml\n' + [...Array(MAX_LINE_LENGTH - 1).keys()].map(() => `hi`).join('\n') + '\n```';
    await listener.handler(mockMessage);
    assert.deepStrictEqual(
      sendMessage.content,
      `<@${mockMessage.author.id}> I converted your message into a file since it's above 15 lines :+1:`,
    );
    assert.deepStrictEqual(sendMessage.files[0].name, 'message.yaml');
  });

  it('Content is large and language is unknown', async () => {
    mockMessage.content =
      '```unknown\n' + [...Array(MAX_LINE_LENGTH - 1).keys()].map(() => `hi`).join('\n') + '\n```';
    await listener.handler(mockMessage);
    assert.deepStrictEqual(
      sendMessage.content,
      `<@${mockMessage.author.id}> I converted your message into a file since it's above 15 lines :+1:`,
    );
    assert.deepStrictEqual(sendMessage.files[0].name, 'message.txt');
  });

  it('Ignore bots', async () => {
    mockMessage.author.bot = true;
    mockMessage.content = [...Array(MAX_LINE_LENGTH + 1).keys()].map(() => `hi`).join('\n');
    await listener.handler(mockMessage);
    assert.deepStrictEqual(sendMessage.content, undefined);
  });

  it('Ignore roles', async () => {
    mockMessage.member.roles.cache = [{ name: 'Mod' }];
    mockMessage.content = [...Array(MAX_LINE_LENGTH + 1).keys()].map(() => `hi`).join('\n');
    await listener.handler(mockMessage);
    assert.deepStrictEqual(sendMessage.content, undefined);
  });

  it('Ignore non-text channel types', async () => {
    mockMessage.channel.type = ChannelType.PublicThread;
    mockMessage.content = [...Array(MAX_LINE_LENGTH + 1).keys()].map(() => `hi`).join('\n');
    await listener.handler(mockMessage);
    assert.deepStrictEqual(sendMessage.content, undefined);
  });
});
