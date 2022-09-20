import { entityComponents, coreComponents } from '../github-webhook.const';
import { basename } from 'path';
import { ListPullRequestFiles } from '../github-webhook.const';

export class ParsedPath {
  public file: ListPullRequestFiles[0];
  public type:
    | null
    | 'core'
    | 'auth'
    | 'auth_providers'
    | 'generated'
    | 'scripts'
    | 'helpers'
    | 'util'
    | 'test'
    | 'services'
    | 'component'
    | 'platform' = null;
  public component: null | string = null;
  public platform: null | string = null;
  public core = false;

  constructor(file: ListPullRequestFiles[0]) {
    this.file = file;
    const parts = file.filename.split('/');
    const rootFolder = parts.length > 1 ? parts.shift() : undefined;

    if (!['tests', 'homeassistant'].includes(rootFolder)) {
      return;
    }

    const subfolder = parts.shift();

    if (!['components', 'fixtures', 'generated'].includes(subfolder)) {
      this.core = true;

      if (subfolder.endsWith('.py')) {
        this.type = 'core';
      } else {
        this.type = subfolder as any;
      }
      return;
    }

    // This is not possible anymore after great migration
    if (parts.length < 2) {
      return;
    }

    this.component = parts.shift();
    let filename = parts[0].replace('.py', '');

    if (rootFolder === 'tests') {
      this.type = 'test';
      filename = filename.replace('test_', '');
      if (entityComponents.has(filename)) {
        this.platform = filename;
      }
    } else if (filename === 'services.yaml') {
      this.type = 'services';
    } else if (entityComponents.has(filename)) {
      this.type = 'platform';
      this.platform = filename;
    } else {
      this.type = 'component';
    }

    this.core = coreComponents.has(this.component);
  }

  get additions() {
    return this.file.additions;
  }

  get status() {
    return this.file.status;
  }

  get path() {
    return this.file.filename;
  }

  get filename() {
    return basename(this.path);
  }
}
