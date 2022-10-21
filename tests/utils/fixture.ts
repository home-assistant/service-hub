import fs from 'fs';
import findUp from 'find-up';
import deepmerge from 'deepmerge';

const fixures = findUp.sync('fixtures', { cwd: __filename, type: 'directory' });

export const loadJsonFixture = <T>(fixture: string, override?: Partial<T>): T =>
  deepmerge(JSON.parse(fs.readFileSync(`${fixures}/${fixture}.json`, 'utf8')), override || {});
