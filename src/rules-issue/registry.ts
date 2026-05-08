import type { RegistryConfig } from "../rules/dispatch.js";
import { issueContextComment } from "./issue-context-comment.js";
import { issueDocsSectionLabel } from "./issue-docs-section-label.js";
import { issueIntegrationLabel } from "./issue-integration-label.js";
import { issueIntegrationLinks } from "./issue-integration-links.js";
import { issueMentionCodeOwners } from "./issue-mention-code-owners.js";

export const issueConfig: RegistryConfig = {
  organizations: {},
  repositories: {
    "home-assistant/core": [
      issueMentionCodeOwners,
      issueIntegrationLabel,
      issueIntegrationLinks,
      issueContextComment,
    ],
    "home-assistant/home-assistant.io": [issueMentionCodeOwners, issueDocsSectionLabel],
  },
};
