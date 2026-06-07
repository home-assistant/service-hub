import type { RegistryConfig } from "../rules/dispatch.js";
import type { Rule } from "../rules/types.js";
import { mentionCodeOwners } from "../rules-issue/issue-mention-code-owners.js";
import { cleanupLabelsOnClose } from "./pr-cleanup-labels-on-close.js";
import { prCorePrTypeLabel } from "./pr-core-pr-type-label.js";
import { docsParentingCodeSide } from "./pr-docs-parenting.js";
import { prDraftOnChangesRequested } from "./pr-draft-on-changes-requested.js";
import { prHacktoberfest } from "./pr-hacktoberfest.js";
import { prHasDocsPr } from "./pr-has-docs-pr.js";
import { prLabelDependencyBump } from "./pr-label-dependency-bump.js";
import { prLabelQualityScale } from "./pr-label-quality-scale.js";
import { prLabelWth } from "./pr-label-wth.js";
import { prNewIntegrationValidation } from "./pr-new-integration-validation.js";
import { blockingLabels } from "./pr-no-blocking-labels.js";
import { prNoMergeConflict } from "./pr-no-merge-conflict.js";
import { prPlatinumCodeOwnerApproval } from "./pr-platinum-code-owner-approval.js";

const coreRules: Rule[] = [
  prDraftOnChangesRequested,
  prHacktoberfest,
  prLabelWth,

  prCorePrTypeLabel,
  blockingLabels({
    "awaiting-frontend": { message: "This PR is awaiting changes to the frontend" },
  }),
  prHasDocsPr,
  cleanupLabelsOnClose({ labels: ["Ready for review"] }),
  prLabelDependencyBump,
  docsParentingCodeSide,
  prNewIntegrationValidation,
  prLabelQualityScale,
  prPlatinumCodeOwnerApproval,
  prNoMergeConflict,
  mentionCodeOwners({
    pathPattern: (name) => `homeassistant/components/${name}/*`,
  }),
];

export const prConfig: RegistryConfig = {
  organizations: {},
  repositories: {
    "home-assistant/core": coreRules,
    // Test fork — drives the live bot until we have permission on real core.
    "justanotherariel/hass_core": coreRules,
  },
};
