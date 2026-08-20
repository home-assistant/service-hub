// @ts-nocheck
import * as assert from 'assert';
import { WebhookContext } from '../../../../../services/bots/src/github-webhook/github-webhook.model';
import {
  PrTemplate,
  resetTemplateCache,
} from '../../../../../services/bots/src/github-webhook/handlers/pr_template';
import { mockWebhookContext } from '../../../../utils/test_context';
import { loadJsonFixture } from '../../../../utils/fixture';

// Required checkboxes = 2 type-of-change options + 2 checklist items. The
// manifest item is conditional (under an "If …:" intro) and not required.
const TEMPLATE = `<!--
  You are amazing! Thanks for contributing to our project!
-->
## Proposed change

## Type of change

- [ ] Bugfix (non-breaking change which fixes an issue)
- [ ] New feature (which adds functionality to an existing integration)

## Checklist

- [ ] I understand the code I am submitting and can explain how it works.
- [ ] I have followed the [development checklist][dev-checklist]

If the code communicates with devices, web services, or third-party tools:

- [ ] The manifest file has all fields filled out correctly.
`;

// Replaced the template wholesale with its own structure (mirrors core#172332).
const CUSTOM_BODY = `## Description

Adds support for ALLNET MSR devices via their local JSON API.

## Supported entities
`;

// Uses the template and keeps every required checkbox (the conditional manifest
// item is legitimately omitted; the dev-checklist item uses a plain-text form).
const COMPLIANT_BODY = `## Proposed change

Fixes a bug.

## Type of change

- [ ] Bugfix (non-breaking change which fixes an issue)
- [x] New feature (which adds functionality to an existing integration)

## Checklist

- [x] I understand the code I am submitting and can explain how it works.
- [x] I have followed the development checklist
`;

const makeContext = ({
  body,
  getContent = jest.fn().mockResolvedValue({
    data: { content: Buffer.from(TEMPLATE).toString('base64') },
  }),
}: {
  body: string | null;
  getContent?: jest.Mock;
}): WebhookContext<any> =>
  mockWebhookContext({
    eventType: 'pull_request.opened',
    payload: loadJsonFixture('pull_request.opened', {
      pull_request: { body, base: { ref: 'dev' }, user: { login: 'octocat' } },
    }),
    github: { repos: { getContent } },
  });

describe('PrTemplate', () => {
  let handler: PrTemplate;

  beforeEach(() => {
    handler = new PrTemplate();
    resetTemplateCache();
  });

  it('comments when the description shares no header with the template', async () => {
    const context = makeContext({ body: CUSTOM_BODY });

    await handler.handle(context);

    assert.strictEqual(context.scheduledComments.length, 1);
    const [scheduled] = context.scheduledComments;
    assert.strictEqual(scheduled.handler, 'PrTemplate');
    assert.ok(scheduled.comment.includes('pull request template'));
    assert.ok(scheduled.comment.includes('/.github/PULL_REQUEST_TEMPLATE.md'));
    assert.ok(scheduled.comment.includes('@octocat'));
  });

  it('stays silent when the template is used and every required checkbox is kept', async () => {
    // Also covers: conditional item omitted, and a reference-link item written
    // as plain text — both must still be considered present.
    const context = makeContext({ body: COMPLIANT_BODY });

    await handler.handle(context);

    assert.strictEqual(context.scheduledComments.length, 0);
  });

  it('comments listing the missing checkboxes when one is removed', async () => {
    const context = makeContext({
      body: `## Proposed change

Fixes a bug.

## Type of change

- [x] Bugfix (non-breaking change which fixes an issue)

## Checklist

- [x] I understand the code I am submitting and can explain how it works.
- [x] I have followed the development checklist
`,
    });

    await handler.handle(context);

    assert.strictEqual(context.scheduledComments.length, 1);
    const [scheduled] = context.scheduledComments;
    assert.ok(scheduled.comment.includes('missing'));
    assert.ok(
      scheduled.comment.includes(
        'New feature (which adds functionality to an existing integration)',
      ),
    );
    // A kept box must not be listed as missing.
    assert.ok(!scheduled.comment.includes('I understand the code I am submitting'));
  });

  it('treats an annotated checkbox as present (startsWith match)', async () => {
    const context = makeContext({
      body: `## Proposed change

Fixes a bug.

## Type of change

- [ ] Bugfix (non-breaking change which fixes an issue)
- [x] New feature (which adds functionality to an existing integration)

## Checklist

- [x] I understand the code I am submitting and can explain how it works. (done in commit abc123)
- [x] I have followed the development checklist
`,
    });

    await handler.handle(context);

    assert.strictEqual(context.scheduledComments.length, 0);
  });

  it('stays silent when template headers are indented (GitHub still renders them)', async () => {
    const context = makeContext({
      body:
        '  ## Proposed change\n\n  Fixes a bug.\n\n  ## Type of change\n\n' +
        '  - [ ] Bugfix (non-breaking change which fixes an issue)\n' +
        '  - [x] New feature (which adds functionality to an existing integration)\n\n' +
        '  ## Checklist\n\n' +
        '  - [x] I understand the code I am submitting and can explain how it works.\n' +
        '  - [x] I have followed the development checklist\n',
    });

    await handler.handle(context);

    assert.strictEqual(context.scheduledComments.length, 0);
  });

  it('comments on an empty description (template is mandatory)', async () => {
    const context = makeContext({ body: null });

    await handler.handle(context);

    assert.strictEqual(context.scheduledComments.length, 1);
  });

  it('fails open when the template cannot be fetched', async () => {
    const context = makeContext({
      body: CUSTOM_BODY,
      getContent: jest.fn().mockRejectedValue(new Error('404 not found')),
    });

    await handler.handle(context);

    assert.strictEqual(context.scheduledComments.length, 0);
  });

  it('fetches the template only once for the same repo and ref (TTL cache)', async () => {
    const getContent = jest.fn().mockResolvedValue({
      data: { content: Buffer.from(TEMPLATE).toString('base64') },
    });

    await handler.handle(makeContext({ body: CUSTOM_BODY, getContent }));
    await handler.handle(makeContext({ body: CUSTOM_BODY, getContent }));

    expect(getContent).toHaveBeenCalledTimes(1);
  });

  it('fails open when the template has no recognizable headers', async () => {
    const context = makeContext({
      body: CUSTOM_BODY,
      getContent: jest.fn().mockResolvedValue({
        data: { content: Buffer.from('just some text, no headers').toString('base64') },
      }),
    });

    await handler.handle(context);

    assert.strictEqual(context.scheduledComments.length, 0);
  });
});
