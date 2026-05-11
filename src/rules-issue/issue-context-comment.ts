import { EventType } from "../github/types.js";
import type { Rule } from "../rules/types.js";

// Embedded from data/github/issue_context.yaml
// In CF Workers we can't read files — this is small enough to inline.
const issueContext: Record<string, string> = {
  _integration_default_message: `Thanks for reporting this issue!

Before we dive in, please make sure this isn't a duplicate by searching through existing issues. Also check recently closed issues, as your problem might already be fixed but not yet released.`,
  "custom integration": `Hey, thank you for taking the time to report this! :pray:

The issue appears to be related to a [custom integration](https://www.home-assistant.io/docs/glossary/#custom-integration) and is not part of Home Assistant core.
Please report the issue directly in the issue tracker of the custom integration instead. Thank you for understanding! :blush:`,
};

const contextLabels = new Set(Object.keys(issueContext).filter((k) => !k.startsWith("_")));

export const issueContextComment: Rule = {
  name: "issue-context-comment",
  description: "Posts context comments when issues are labeled with integration or special labels",
  events: {
    [EventType.ISSUES_LABELED]: async (ctx) => {
      if (!ctx.payload.label) return;
      const labelName = ctx.payload.label.name;
      const isIntegration = labelName.startsWith("integration: ");
      if (!isIntegration && !contextLabels.has(labelName)) return;

      const author = ctx.payload.issue.user.login;
      const labelContext = issueContext[labelName] ?? "";

      let comment: string;
      if (isIntegration) {
        const defaultMessage = issueContext._integration_default_message ?? "";
        const encodedLabel = encodeURIComponent(labelName);
        const issueLink = `https://github.com/home-assistant/core/issues?q=%20label%3A%22${encodedLabel}%22%20`;
        comment = `@${author} ${defaultMessage}\n\n${issueLink}${labelContext ? `\n${labelContext}` : ""}`;
      } else if (labelContext) {
        comment = `@${author} ${labelContext}`;
      } else {
        return;
      }

      return [{ type: "comment", body: comment }];
    },
  },
};
