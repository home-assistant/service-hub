// @ts-nocheck
import * as assert from 'assert';

import {
  extractForumLinks,
  extractIntegrationFromBody,
  normalizeIntegrationName,
} from '../../../../../services/bots/src/github-webhook/utils/text_parser';

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

  describe('extractIntegrationFromBody', () => {
    const makeBody = (integration: string) =>
      `### Integration causing the issue\n\n${integration}\n\n### Link to integration documentation`;

    it('extracts raw integration name', () => {
      assert.strictEqual(extractIntegrationFromBody(makeBody('Rain bird')), 'Rain bird');
    });

    it('extracts single word', () => {
      assert.strictEqual(extractIntegrationFromBody(makeBody('ZHA')), 'ZHA');
    });

    it('returns undefined for _No response_', () => {
      assert.strictEqual(extractIntegrationFromBody(makeBody('_No response_')), undefined);
    });

    it('returns undefined when field is missing', () => {
      assert.strictEqual(extractIntegrationFromBody('Some random body text'), undefined);
    });
  });

  describe('normalizeIntegrationName', () => {
    it('ZHA -> [zha]', () => {
      assert.deepStrictEqual(normalizeIntegrationName('ZHA'), ['zha']);
    });

    it('Rain bird -> [rainbird, rain_bird, rain-bird]', () => {
      assert.deepStrictEqual(normalizeIntegrationName('Rain bird'), [
        'rainbird',
        'rain_bird',
        'rain-bird',
      ]);
    });

    it('Matter -> [matter]', () => {
      assert.deepStrictEqual(normalizeIntegrationName('Matter'), ['matter']);
    });

    it('SleepIQ -> [sleepiq]', () => {
      assert.deepStrictEqual(normalizeIntegrationName('SleepIQ'), ['sleepiq']);
    });

    it('Overkiz -> [overkiz]', () => {
      assert.deepStrictEqual(normalizeIntegrationName('Overkiz'), ['overkiz']);
    });
  });
});
