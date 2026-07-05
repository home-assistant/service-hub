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
import { blockingLabels } from "../rules/blocking-labels.js";
import { changeType } from "../rules/change-type.js";
import { mentionCodeOwners } from "../rules/code-owner-mention.js";
import { dependencyBump } from "../rules/dependency-bump.js";
import { docsParenting } from "../rules/docs-parenting.js";
import { docsPrPresent } from "../rules/docs-pr-present.js";
import { fileShape } from "../rules/file-shape.js";
import { hacktoberfest } from "../rules/hacktoberfest.js";
import { integrationDomain } from "../rules/integration-domain.js";
import { integrationTopRank } from "../rules/integration-top-rank.js";
import { mergeConflict } from "../rules/merge-conflict.js";
import { mergeTarget } from "../rules/merge-target.js";
import { newIntegrationValidation } from "../rules/new-integration-validation.js";
import { platinumApproval } from "../rules/platinum-approval.js";
import { qualityScale } from "../rules/quality-scale.js";
import { reviewComments } from "../rules/review-comments.js";
import { wth } from "../rules/wth.js";
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
  rules: [
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
