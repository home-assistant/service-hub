// @ts-nocheck
import * as assert from 'assert';

import { markdownParser } from '../../../../../services/bots/src/github-webhook/utils/markdown';

const CORE_ISSUE_TEMPLATE = `
### The problem

Lorem ipsum

### What version of Home Assistant Core has the issue?

core-2099.99.9

### What was the last working version of Home Assistant Core?

2022.0.0

### What type of installation are you running?

Home Assistant OS

### Integration causing the issue

_No response_

### Link to integration documentation on our website

_No response_

### Diagnostics information

[config_entry-integration-1234567890abcdefghijklmnopqrstuvwxyz.json.txt](https://github.com/home-assistant/core/files/12345/config_entry-integration-1234567890abcdefghijklmnopqrstuvwxyz.json.txt)


### Example YAML snippet

_No response_

### Anything in the logs that might be useful for us?

\`\`\`txt

\`\`\`


### Additional information

Rasberry Pi 4 Model B

`;

const CORE_PR_TEMPLATE = `
<!--
  You are amazing! Thanks for contributing to our project!
  Please, DO NOT DELETE ANY TEXT from this template! (unless instructed).
-->
## Breaking change
<!--
  If your PR contains a breaking change for existing users, it is important
  to tell them what breaks, how to make it work again and why we did this.
  This piece of text is published with the release notes, so it helps if you
  write it towards our users, not us.
  Note: Remove this section if this PR is NOT a breaking change.
-->


## Proposed change
<!--
  Describe the big picture of your changes here to communicate to the
  maintainers why we should accept this pull request. If it fixes a bug
  or resolves a feature request, be sure to link to that issue in the
  additional information section.
-->

LOREM IPSUM

## Type of change
<!--
  What type of change does your PR introduce to Home Assistant?
  NOTE: Please, check only 1! box!
  If your PR requires multiple boxes to be checked, you'll most likely need to
  split it into multiple PRs. This makes things easier and faster to code review.
-->

- [x] Dependency upgrade
- [ ] Bugfix (non-breaking change which fixes an issue)
- [ ] New integration (thank you!)
- [ ] New feature (which adds functionality to an existing integration)
- [ ] Deprecation (breaking change to happen in the future)
- [ ] Breaking change (fix/feature causing existing functionality to break)
- [ ] Code quality improvements to existing code or addition of tests

## Additional information
<!--
  Details are important, and help maintainers processing your PR.
  Please be sure to fill out additional details, if applicable.
-->

- This PR fixes or closes issue: fixes #
- This PR is related to issue: #79313
- Link to documentation pull request:

## Checklist
<!--
  Put an \`x\` in the boxes that apply. You can also fill these out after
  creating the PR. If you're unsure about any of them, don't hesitate to ask.
  We're here to help! This is simply a reminder of what we are going to look
  for before merging your code.
-->

- [ ] The code change is tested and works locally.
- [ ] Local tests pass. **Your PR cannot be merged unless tests pass**
- [ ] There is no commented out code in this PR.
- [ ] I have followed the [development checklist][dev-checklist]
- [ ] The code has been formatted using Black (\`black --fast homeassistant tests\`)
- [ ] Tests have been added to verify that the new code works.

If user exposed functionality or configuration variables are added/changed:

- [ ] Documentation added/updated for [www.home-assistant.io][docs-repository]

If the code communicates with devices, web services, or third-party tools:

- [ ] The [manifest file][manifest-docs] has all fields filled out correctly.
      Updated and included derived files by running: \`python3 -m script.hassfest\`.
- [ ] New or updated dependencies have been added to \`requirements_all.txt\`.
      Updated by running \`python3 -m script.gen_requirements_all\`.
- [ ] For the updated dependencies - a link to the changelog, or at minimum a diff between library versions is added to the PR description.
- [ ] Untested files have been added to \`.coveragerc\`.

The integration reached or maintains the following [Integration Quality Scale][quality-scale]:
<!--
  The Integration Quality Scale scores an integration on the code quality
  and user experience. Each level of the quality scale consists of a list
  of requirements. We highly recommend getting your integration scored!
-->

- [ ] No score or internal
- [ ] 🥈 Silver
- [ ] 🥇 Gold
- [ ] 🏆 Platinum

<!--
  This project is very active and we have a high turnover of pull requests.

  Unfortunately, the number of incoming pull requests is higher than what our
  reviewers can review and merge so there is a long backlog of pull requests
  waiting for review. You can help here!

  By reviewing another pull request, you will help raise the code quality of
  that pull request and the final review will be faster. This way the general
  pace of pull request reviews will go up and your wait time will go down.

  When picking a pull request to review, try to choose one that hasn't yet
  been reviewed.

  Thanks for helping out!
-->

To help with the load of incoming pull requests:

- [ ] I have reviewed two other [open pull requests][prs] in this repository.

[prs]: https://github.com/home-assistant/core/pulls?q=is%3Aopen+is%3Apr+-author%3A%40me+-draft%3Atrue+-label%3Awaiting-for-upstream+sort%3Acreated-desc+review%3Anone+-status%3Afailure

<!--
  Thank you for contributing <3

  Below, some useful links you could explore:
-->
[dev-checklist]: https://developers.home-assistant.io/docs/en/development_checklist.html
[manifest-docs]: https://developers.home-assistant.io/docs/en/creating_integration_manifest.html
[quality-scale]: https://developers.home-assistant.io/docs/en/next/integration_quality_scale_index.html
[docs-repository]: https://github.com/home-assistant/home-assistant.io

`;

describe('markdownParser', () => {
  it('Core issue template', async () => {
    assert.deepStrictEqual(markdownParser(CORE_ISSUE_TEMPLATE), [
      { title: 'The problem', urls: [], tasks: [], text: 'Lorem ipsum' },
      {
        title: 'What version of Home Assistant Core has the issue?',
        urls: [],
        tasks: [],
        text: 'core-2099.99.9',
      },
      {
        title: 'What was the last working version of Home Assistant Core?',
        urls: [],
        tasks: [],
        text: '2022.0.0',
      },
      {
        title: 'What type of installation are you running?',
        urls: [],
        tasks: [],
        text: 'Home Assistant OS',
      },
      { title: 'Integration causing the issue', urls: [], tasks: [], text: '_No response_' },
      {
        title: 'Link to integration documentation on our website',
        urls: [],
        tasks: [],
        text: '_No response_',
      },
      {
        title: 'Diagnostics information',
        urls: [
          new URL(
            'https://github.com/home-assistant/core/files/12345/config_entry-integration-1234567890abcdefghijklmnopqrstuvwxyz.json.txt',
          ),
        ],
        tasks: [],
      },
      { title: 'Example YAML snippet', urls: [], tasks: [], text: '_No response_' },
      {
        title: 'Anything in the logs that might be useful for us?',
        urls: [],
        tasks: [],
        text: '```txt\n```',
      },
      { title: 'Additional information', urls: [], tasks: [], text: 'Rasberry Pi 4 Model B' },
    ]);
  });

  it('Core pull request template', async () => {
    assert.deepStrictEqual(markdownParser(CORE_PR_TEMPLATE, { ignoreComments: true }), [
      { title: 'Breaking change', urls: [], tasks: [] },
      { title: 'Proposed change', urls: [], tasks: [], text: 'LOREM IPSUM' },
      {
        title: 'Type of change',
        urls: [],
        tasks: [
          { checked: true, description: 'Dependency upgrade' },
          { checked: false, description: 'Bugfix (non-breaking change which fixes an issue)' },
          { checked: false, description: 'New integration (thank you!)' },
          {
            checked: false,
            description: 'New feature (which adds functionality to an existing integration)',
          },
          { checked: false, description: 'Deprecation (breaking change to happen in the future)' },
          {
            checked: false,
            description: 'Breaking change (fix/feature causing existing functionality to break)',
          },
          {
            checked: false,
            description: 'Code quality improvements to existing code or addition of tests',
          },
        ],
      },
      {
        title: 'Additional information',
        urls: [],
        tasks: [],
        text: '- This PR fixes or closes issue: fixes #\n- This PR is related to issue: #\n- Link to documentation pull request:',
      },
      {
        title: 'Checklist',
        urls: [
          new URL(
            'https://github.com/home-assistant/core/pulls?q=is%3Aopen+is%3Apr+-author%3A%40me+-draft%3Atrue+-label%3Awaiting-for-upstream+sort%3Acreated-desc+review%3Anone+-status%3Afailure',
          ),
          new URL('https://developers.home-assistant.io/docs/en/development_checklist.html'),
          new URL(
            'https://developers.home-assistant.io/docs/en/creating_integration_manifest.html',
          ),
          new URL(
            'https://developers.home-assistant.io/docs/en/next/integration_quality_scale_index.html',
          ),
          new URL('https://github.com/home-assistant/home-assistant.io'),
        ],
        tasks: [
          { checked: false, description: 'The code change is tested and works locally.' },
          {
            checked: false,
            description: 'Local tests pass. **Your PR cannot be merged unless tests pass**',
          },
          { checked: false, description: 'There is no commented out code in this PR.' },
          {
            checked: false,
            description: 'I have followed the [development checklist][dev-checklist]',
          },
          {
            checked: false,
            description:
              'The code has been formatted using Black (`black --fast homeassistant tests`)',
          },
          {
            checked: false,
            description: 'Tests have been added to verify that the new code works.',
          },
          {
            checked: false,
            description: 'Documentation added/updated for [www.home-assistant.io][docs-repository]',
          },
          {
            checked: false,
            description: 'The [manifest file][manifest-docs] has all fields filled out correctly.',
          },
          {
            checked: false,
            description: 'New or updated dependencies have been added to `requirements_all.txt`.',
          },
          {
            checked: false,
            description:
              'For the updated dependencies - a link to the changelog, or at minimum a diff between library versions is added to the PR description.',
          },
          { checked: false, description: 'Untested files have been added to `.coveragerc`.' },
          { checked: false, description: 'No score or internal' },
          { checked: false, description: '🥈 Silver' },
          { checked: false, description: '🥇 Gold' },
          { checked: false, description: '🏆 Platinum' },
          {
            checked: false,
            description: 'I have reviewed two other [open pull requests][prs] in this repository.',
          },
        ],
        text: 'If user exposed functionality or configuration variables are added/changed:\nIf the code communicates with devices, web services, or third-party tools:\nUpdated and included derived files by running: `python3 -m script.hassfest`.\nUpdated by running `python3 -m script.gen_requirements_all`.\nThe integration reached or maintains the following [Integration Quality Scale][quality-scale]:\nTo help with the load of incoming pull requests:',
      },
    ]);
  });
});
