<!-- ha-bot-dashboard -->

{{#author}}👋 Hi @{{author}}!{{/author}}{{^author}}👋 Hi!{{/author}} Thanks for reporting an issue to **{{friendlyName}}**.

Before we dive in, please make sure this isn't a duplicate by searching through existing issues. Also check recently closed issues, as your problem might already be fixed but not yet released.

{{#blocks.reporting-guidance}}
**Reporting guidance**
{{#paragraphs}}
{{.}}
{{/paragraphs}}

{{/blocks.reporting-guidance}}
{{#blocks.integration-links}}
**Integration links**
{{#domains}}
- `{{domain}}`: [documentation]({{docs}}) · [source]({{source}}) · [known issues]({{issues}})
{{/domains}}

{{/blocks.integration-links}}
{{#hasChecks}}
## Checks

{{#hasFailures}}
Things to address:
{{/hasFailures}}
{{^hasFailures}}
**✨ Everything's in order!**
{{/hasFailures}}

{{#hasVisibleRows}}
| Status | Check | Details |
|--------|-------|---------|
{{#visibleRows}}
| {{icon}} | {{title}} | {{message}} |
{{/visibleRows}}

{{/hasVisibleRows}}
{{#hasCollapsedRows}}
<details>
<summary>{{collapsedSummary}}</summary>

| Status | Check | Details |
|--------|-------|---------|
{{#collapsedRows}}
| {{icon}} | {{title}} | {{message}} |
{{/collapsedRows}}

</details>

{{/hasCollapsedRows}}
{{/hasChecks}}
{{#hasCommands}}
<details><summary>Bot commands</summary>

Reply with `/{{commandSlug}} <command>`. Several commands can be stacked, one per line:

{{#commands}}
- `{{name}}` — {{description}}{{permissionNote}}{{exampleSuffix}}
{{/commands}}

</details>

{{/hasCommands}}
---
<sub>Last updated: {{lastUpdated}}</sub>

{{persistenceTail}}