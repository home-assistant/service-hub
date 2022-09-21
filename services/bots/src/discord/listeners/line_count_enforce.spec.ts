// @ts-nocheck
import * as assert from 'assert';
import { Message } from 'discord.js';
import { LineCountEnforcer, MAX_LINE_LENGTH } from './line_count_enforcer';

describe('LineCountEnforcer', () => {
  let listener: LineCountEnforcer;
  let mockMessage: Message;
  let sendMessage: any;

  beforeEach(function () {
    listener = new LineCountEnforcer();
    sendMessage = {};
    mockMessage = {
      content: '',
      author: { bot: false },
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
      "I converted your message into a file since it's above 15 lines :+1:",
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
      "I converted your message into a file since it's above 15 lines :+1:",
    );
    assert.deepStrictEqual(sendMessage.files[0].name, 'message.yaml');
  });

  it('Content is large and language is unknown', async () => {
    mockMessage.content =
      '```unknown\n' + [...Array(MAX_LINE_LENGTH - 1).keys()].map(() => `hi`).join('\n') + '\n```';
    await listener.handler(mockMessage);
    assert.deepStrictEqual(
      sendMessage.content,
      "I converted your message into a file since it's above 15 lines :+1:",
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
});
