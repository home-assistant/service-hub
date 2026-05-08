import type { RegistryConfig } from "../rules/dispatch.js";
import { issueContextComment } from "./issue-context-comment.js";
import { issueDocsSectionLabel } from "./issue-docs-section-label.js";
import { issueIntegrationLabel } from "./issue-integration-label.js";
import { issueIntegrationLinks } from "./issue-integration-links.js";
import { mentionCodeOwners } from "./issue-mention-code-owners.js";

export const issueConfig: RegistryConfig = {
  organizations: {},
  repositories: {
    "home-assistant/core": [
      mentionCodeOwners({
        pathPattern: (name) => `homeassistant/components/${name}/*`,
      }),
      issueIntegrationLabel,
      issueIntegrationLinks,
      issueContextComment,
    ],
    "home-assistant/home-assistant.io": [
      mentionCodeOwners({
        pathPattern: (name) => `source/_integrations/${name}.markdown`,
        itemLabel: "feedback",
      }),
      issueDocsSectionLabel,
    ],
  },
};
