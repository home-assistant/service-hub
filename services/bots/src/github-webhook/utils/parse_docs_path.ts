import { ListPullRequestFiles } from '../github-webhook.const';

export class ParsedDocsPath {
  public file: ListPullRequestFiles[0];
  public type: 'integration' | null = null;
  public component: null | string = null;
  public platform: null | string = null;

  constructor(file: ListPullRequestFiles[0]) {
    this.file = file;
    const parts = file.filename.split('/');
    if (parts.length === 0) {
      return;
    }
    if (parts.shift() !== 'source' || parts.shift() !== '_components') {
      return;
    }

    this.type = 'integration';

    let integration = parts.shift();
    if (integration.endsWith('.markdown')) {
      integration = integration.substring(0, integration.lastIndexOf('.'));
    }

    if (!integration.includes('.')) {
      this.component = integration;
      return;
    }

    const [platform, component] = integration.split('.');
    this.component = component;
    this.platform = platform;
  }
}
