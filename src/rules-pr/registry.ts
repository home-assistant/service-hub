import type { RegistryConfig } from "../rules/dispatch.js";
import { mentionCodeOwners } from "../rules-issue/issue-mention-code-owners.js";
import { branchLabel } from "./docs-pr-branch-label.js";
import { docsParentingDocsSide } from "./docs-parenting-docs-side.js";
import { docsPrTargetBranch } from "./docs-pr-target-branch.js";
import { prAutoLabel } from "./pr-auto-label.js";
import { claSigned } from "./pr-cla-signed.js";
import { cleanupLabelsOnClose } from "./pr-cleanup-labels-on-close.js";
import { docsParentingCodeSide } from "./pr-docs-parenting.js";
import { prDraftOnChangesRequested } from "./pr-draft-on-changes-requested.js";
import { prHacktoberfest } from "./pr-hacktoberfest.js";
import { prHasDocsPr } from "./pr-has-docs-pr.js";
import { requiredLabels } from "./pr-has-type-label.js";
import { prLabelDependencyBump } from "./pr-label-dependency-bump.js";
import { prLabelIntentsLanguage } from "./pr-label-intents-language.js";
import { prLabelQualityScale } from "./pr-label-quality-scale.js";
import { prLabelWth } from "./pr-label-wth.js";
import { prNewIntegrationValidation } from "./pr-new-integration-validation.js";
import { blockingLabels } from "./pr-no-blocking-labels.js";
import { prNoMergeConflict } from "./pr-no-merge-conflict.js";
import { prPlatinumCodeOwnerApproval } from "./pr-platinum-code-owner-approval.js";

export const prConfig: RegistryConfig = {
  organizations: {
    "home-assistant": [
      claSigned({
        ignoredRepos: [
          "home-assistant/.github",
          "home-assistant/1password-teams-open-source",
          "home-assistant/architecture",
          "home-assistant/assets",
          "home-assistant/brands",
          "home-assistant/bthome.io",
          "home-assistant/buildroot",
          "home-assistant/companion.home-assistant",
          "home-assistant/data.home-assistant",
          "home-assistant/developers.home-assistant",
          "home-assistant/home-assistant.io",
          "home-assistant/organization",
          "home-assistant/partner.home-assistant",
          "home-assistant/people",
          "home-assistant/version",
          "home-assistant/webawesome",
        ],
      }),
      prDraftOnChangesRequested,
      prHacktoberfest,
      prLabelWth,
    ],
    esphome: [prDraftOnChangesRequested],
  },
  repositories: {
    "home-assistant/core": [
      prAutoLabel,
      requiredLabels({
        labels: [
          "breaking-change",
          "bugfix",
          "code-quality",
          "dependency",
          "deprecation",
          "new-feature",
          "new-integration",
        ],
      }),
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
    ],
    "home-assistant/supervisor": [
      requiredLabels({
        labels: [
          "breaking-change",
          "new-feature",
          "bugfix",
          "style",
          "refactor",
          "performance",
          "test",
          "build",
          "ci",
          "chore",
          "revert",
          "dependencies",
        ],
      }),
    ],
    "home-assistant/frontend": [
      blockingLabels({
        "wait for backend": { message: "This PR is awaiting changes to the backend" },
      }),
      docsParentingCodeSide,
    ],
    "home-assistant/home-assistant.io": [
      cleanupLabelsOnClose({
        labels: ["needs-rebase", "in-progress", "awaits-parent", "ready-for-review", "parent-merged"],
      }),
      branchLabel({ validLabels: ["current", "rc", "next"] }),
      docsPrTargetBranch,
      docsParentingDocsSide,
      mentionCodeOwners({
        pathPattern: (name) => `source/_integrations/${name}.markdown`,
        itemLabel: "feedback",
      }),
    ],
    "home-assistant/intents": [prLabelIntentsLanguage],
    "esphome/esphome": [prNoMergeConflict],
  },
};
