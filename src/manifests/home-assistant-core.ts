import { blockingLabels } from "../checks/blocking-labels.js";
import { changeType } from "../checks/change-type.js";
import { mentionCodeOwners } from "../checks/code-owner-mention.js";
import { dependencyBump } from "../checks/dependency-bump.js";
import { docsParenting } from "../checks/docs-parenting.js";
import { docsPrPresent } from "../checks/docs-pr-present.js";
import { fileShape } from "../checks/file-shape.js";
import { hacktoberfest } from "../checks/hacktoberfest.js";
import { integrationDomain } from "../checks/integration-domain.js";
import { integrationTopRank } from "../checks/integration-top-rank.js";
import { mergeConflict } from "../checks/merge-conflict.js";
import { mergeTarget } from "../checks/merge-target.js";
import { newIntegrationValidation } from "../checks/new-integration-validation.js";
import { platinumApproval } from "../checks/platinum-approval.js";
import { qualityScale } from "../checks/quality-scale.js";
import { reviewComments } from "../checks/review-comments.js";
import { wth } from "../checks/wth.js";
import { close } from "../commands/close.js";
import { addLabel } from "../commands/label-add.js";
import { removeLabel } from "../commands/label-remove.js";
import { markDraft } from "../commands/mark-draft.js";
import { readyForReview } from "../commands/ready-for-review.js";
import { rename } from "../commands/rename.js";
import { reopen } from "../commands/reopen.js";
import { unassign } from "../commands/unassign.js";
import { update } from "../commands/update.js";
import { updateBranch } from "../commands/update-branch.js";
import type { RepoManifest } from "./types.js";

const componentCodeowners = (domain: string) => `homeassistant/components/${domain}/*`;

const MANAGEABLE_LABELS = [
  "needs-more-information",
  "problem in dependency",
  "problem in custom component",
  "problem in config",
  "problem in device",
  "feature-request",
];

export const homeAssistantCore: RepoManifest = {
  slug: "home-assistant/core",
  aliases: ["justanotherariel/hass_core"],
  checks: [
    // Integrations
    integrationDomain,
    integrationTopRank,
    qualityScale,
    newIntegrationValidation,
    mentionCodeOwners({ pathPattern: componentCodeowners }),

    // Docs
    docsPrPresent,
    docsParenting,

    // Mergeability
    mergeConflict,
    mergeTarget,

    // Review
    reviewComments,
    platinumApproval,

    // Classification & process
    changeType,
    fileShape,
    dependencyBump,
    hacktoberfest,
    wth,
    blockingLabels({
      "awaiting-frontend": { message: "This PR is awaiting changes to the frontend" },
    }),
  ],
  commands: [
    update,
    close,
    reopen,
    rename,
    addLabel(MANAGEABLE_LABELS),
    removeLabel(MANAGEABLE_LABELS),
    unassign,
    markDraft,
    readyForReview,
    updateBranch,
  ],
};
