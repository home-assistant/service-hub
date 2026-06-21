import type { RegistryConfig } from "../rules/dispatch.js";
import { mentionCodeOwners } from "../rules/mention-code-owners.js";
import type { Rule } from "../rules/types.js";
import { docsParentingCodeSide } from "./pr-docs-parenting.js";
import { prHasDocsPr } from "./pr-has-docs-pr.js";
import { prLabelChangeType } from "./pr-label-change-type.js";
import { prLabelDependencyBump } from "./pr-label-dependency-bump.js";
import { prLabelFileShape } from "./pr-label-file-shape.js";
import { prLabelHacktoberfest } from "./pr-label-hacktoberfest.js";
import { prLabelIntegrationName } from "./pr-label-integration-name.js";
import { prLabelQualityScale } from "./pr-label-quality-scale.js";
import { prLabelWth } from "./pr-label-wth.js";
import { prMergeTarget } from "./pr-merge-target.js";
import { prNewIntegrationValidation } from "./pr-new-integration-validation.js";
import { blockingLabels } from "./pr-no-blocking-labels.js";
import { prNoMergeConflict } from "./pr-no-merge-conflict.js";
import { prPlatinumCodeOwnerApproval } from "./pr-platinum-code-owner-approval.js";
import { prReviewComments } from "./pr-review-comments.js";

const coreRules: Rule[] = [
  prReviewComments,
  prLabelHacktoberfest,
  prLabelWth,

  prLabelChangeType,
  prLabelIntegrationName,
  prMergeTarget,
  prLabelFileShape,
  blockingLabels({
    "awaiting-frontend": { message: "This PR is awaiting changes to the frontend" },
  }),
  prHasDocsPr,
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
    // Test fork
    "justanotherariel/hass_core": coreRules,
  },
};
