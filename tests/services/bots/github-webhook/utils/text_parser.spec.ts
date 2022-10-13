// @ts-nocheck
import * as assert from 'assert';

import { extractForumLinks } from '../../../../../services/bots/src/github-webhook/utils/text_parser';

describe('text_parser', () => {
  it('extractForumLinks', async () => {
    assert.deepStrictEqual(
      extractForumLinks(`https://community.home-assistant.io/t/example-topic/12456`),
      ['https://community.home-assistant.io/t/example-topic/12456'],
    );

    assert.deepStrictEqual(
      extractForumLinks(`\nhttps://community.home-assistant.io/t/example-topic/12456  `),
      ['https://community.home-assistant.io/t/example-topic/12456'],
    );

    assert.deepStrictEqual(
      extractForumLinks(`HI https://community.home-assistant.io/t/example-topic/12456\n  `),
      ['https://community.home-assistant.io/t/example-topic/12456'],
    );

    assert.deepStrictEqual(
      extractForumLinks(`[HI](https://community.home-assistant.io/t/example-topic/12456)`),
      ['https://community.home-assistant.io/t/example-topic/12456'],
    );

    assert.deepStrictEqual(
      extractForumLinks(`HI http://community.home-assistant.io/t/example-topic/12456\n  `),
      [],
    );
  });
});
