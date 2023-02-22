import * as assert from 'assert';
import { ListPullRequestFiles } from '../../../../../services/bots/src/github-webhook/github-webhook.const';
import { ParsedPath } from '../../../../../services/bots/src/github-webhook/utils/parse_path';

describe('ParsedPath', () => {
  describe.each([
    [
      'homeassistant/components/demo/__init__.py',
      { core: true, platform: null, component: 'demo', type: 'component' },
    ],
    [
      'homeassistant/components/demo/switch.py',
      { core: true, platform: 'switch', component: 'demo', type: 'platform' },
    ],
  ])('%s', (filename: string, results: Record<string, any>) => {
    for (const [key, value] of Object.entries(results)) {
      const parsedPath = new ParsedPath({ filename } as ListPullRequestFiles[0]);
      it(`${filename} - ${key} (${value})`, () => {
        assert.deepStrictEqual(parsedPath[key], value);
      });
    }
  });
});
