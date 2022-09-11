/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import cp from 'child_process';
import findUp from 'find-up';
import * as fs from 'fs';

function readJson(filepath: string): Record<string, any> | undefined {
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
  } catch (e) {
    /* ignore */
  }

  return;
}

function getValue(cwd: string, name: string, command?: string): string | undefined {
  const versionFile = findUp.sync('version.json', { cwd });
  if (versionFile) {
    const value = readJson(versionFile);
    if (value?.version?.[name]) {
      return value.version[name];
    }
  }

  if (!command) {
    return undefined;
  }

  let stdout = 'unknown';
  try {
    stdout = cp.execSync(command, { cwd }).toString('utf8');
  } catch (e) {
    /* ignore */
  }

  return stdout?.toString().trim();
}

export interface Version {
  commit: string;
  version: string;
}

/**
 * Extract a `Version` set of data, based on the working directory passed in.
 *
 * This function will scan up to locate an optional `version.json` for use in
 * version info as well as attempting to locate the `package.json` in a directory
 * above.
 *
 * If commitHash cannot be found from `version.json` (i.e., this is not
 * production or stage), then an attempt will be made to determine commitHash
 * and sourceRepo dynamically from `git`. If it cannot be found with `git`,
 * just show 'unknown' for commitHash and sourceRepo.
 *
 * @param cwd Current working directory to work from.
 */
export function getVersionInfo(cwd: string): Version {
  const commit = getValue(cwd, 'hash', 'git rev-parse HEAD');
  let version = getValue(cwd, 'version');

  if (!version) {
    const packageFile = findUp.sync('package.json', { cwd });
    version = packageFile ? readJson(packageFile).version : undefined;
  }

  return {
    commit,
    version,
  };
}
