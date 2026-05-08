import type { RegistryConfig } from "../rules/dispatch.js";
import { issueMentionCodeOwners } from "../rules-issue/issue-mention-code-owners.js";
import { docsPrBranchLabel } from "./docs-pr-branch-label.js";
import { docsPrTargetBranch } from "./docs-pr-target-branch.js";
import { prAutoLabel } from "./pr-auto-label.js";
import { prClaSigned } from "./pr-cla-signed.js";
import { prCleanupLabelsOnClose } from "./pr-cleanup-labels-on-close.js";
import { prDocsParenting } from "./pr-docs-parenting.js";
import { prDraftOnChangesRequested } from "./pr-draft-on-changes-requested.js";
import { prHacktoberfest } from "./pr-hacktoberfest.js";
import { prHasDocsPr } from "./pr-has-docs-pr.js";
import { prHasTypeLabel } from "./pr-has-type-label.js";
import { prLabelDependencyBump } from "./pr-label-dependency-bump.js";
import { prLabelIntentsLanguage } from "./pr-label-intents-language.js";
import { prLabelQualityScale } from "./pr-label-quality-scale.js";
import { prLabelWth } from "./pr-label-wth.js";
import { prNewIntegrationValidation } from "./pr-new-integration-validation.js";
import { prNoBlockingLabels } from "./pr-no-blocking-labels.js";
import { prNoMergeConflict } from "./pr-no-merge-conflict.js";
import { prPlatinumCodeOwnerApproval } from "./pr-platinum-code-owner-approval.js";

export const prConfig: RegistryConfig = {
  organizations: {
    "home-assistant": [prClaSigned, prDraftOnChangesRequested, prHacktoberfest, prLabelWth],
    esphome: [prDraftOnChangesRequested],
  },
  repositories: {
    "home-assistant/core": [
      prAutoLabel,
      prHasTypeLabel,
      prNoBlockingLabels,
      prHasDocsPr,
      prCleanupLabelsOnClose,
      prLabelDependencyBump,
      prDocsParenting,
      prNewIntegrationValidation,
      prLabelQualityScale,
      prPlatinumCodeOwnerApproval,
      prNoMergeConflict,
      issueMentionCodeOwners,
    ],
    "home-assistant/supervisor": [prHasTypeLabel],
    "home-assistant/frontend": [prNoBlockingLabels, prDocsParenting],
    "home-assistant/home-assistant.io": [
      prCleanupLabelsOnClose,
      docsPrBranchLabel,
      docsPrTargetBranch,
      prDocsParenting,
      issueMentionCodeOwners,
    ],
    "home-assistant/intents": [prLabelIntentsLanguage],
    "esphome/esphome": [prNoMergeConflict],
  },
};
