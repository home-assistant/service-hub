import { close } from "../../commands/close.js";
import { ignore, unignore } from "../../commands/ignore.js";
import { addLabel } from "../../commands/label-add.js";
import { removeLabel } from "../../commands/label-remove.js";
import { markDraft } from "../../commands/mark-draft.js";
import { rename } from "../../commands/rename.js";
import { reopen } from "../../commands/reopen.js";
import { unassign } from "../../commands/unassign.js";
import { update } from "../../commands/update.js";
import { updateBranch } from "../../commands/update-branch.js";
import { blockingLabels } from "../../rules/blocking-labels.js";
import { byCodeOwner } from "../../rules/by-code-owner.js";
import { mentionCodeOwners } from "../../rules/code-owner-mention.js";
import { docsParenting } from "../../rules/docs-parenting.js";
import { mergeConflict } from "../../rules/merge-conflict.js";
import { mergeTarget } from "../../rules/merge-target.js";
import { reviewComments } from "../../rules/review-comments.js";
import { setIntegration } from "../../rules/set-integration.js";
import { HomeAssistantRepository, homeAssistantOrgRules } from "../home-assistant-org.js";
import type { RepoManifest } from "../types.js";
import { integrationDomainsFromEvent } from "./helpers/integration-domains.js";
import { coreIssueContext } from "./issue-context.js";
import { changeType } from "./rules/change-type.js";
import { dependencyBump } from "./rules/dependency-bump.js";
import { docsPrPresent } from "./rules/docs-pr-present.js";
import { fileShape } from "./rules/file-shape.js";
import { integrationDomain } from "./rules/integration-domain.js";
import { integrationTopRank } from "./rules/integration-top-rank.js";
import { issueContext } from "./rules/issue-context.js";
import { issueLinks } from "./rules/issue-links.js";
import { newIntegrationValidation } from "./rules/new-integration-validation.js";
import { platinumApproval } from "./rules/platinum-approval.js";
import { qualityScale } from "./rules/quality-scale.js";

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
  slug: HomeAssistantRepository.CORE,
  aliases: ["justanotherariel/hass_core"], // TODO: remove alias and alias functionality
  integrationPath: componentCodeowners,
  rules: [
    // Integrations
    integrationDomain,
    integrationTopRank,
    qualityScale,
    newIntegrationValidation,
    mentionCodeOwners({ pathPattern: componentCodeowners, domains: integrationDomainsFromEvent }),
    byCodeOwner({ pathPattern: componentCodeowners, domains: integrationDomainsFromEvent }),

    // Issues
    setIntegration,
    issueLinks,
    issueContext(coreIssueContext),

    // Docs
    docsPrPresent,
    docsParenting,

    // Mergeability
    mergeConflict,
    mergeTarget({ base: "dev" }),

    // Review
    reviewComments,
    platinumApproval,

    // Classification & process
    changeType,
    fileShape,
    dependencyBump,
    blockingLabels({
      "awaiting-frontend": { message: "This PR is awaiting changes to the frontend" },
    }),

    // Org-wide
    ...homeAssistantOrgRules,
  ],
  commands: [
    update,
    ignore,
    unignore,
    close,
    reopen,
    rename,
    addLabel(MANAGEABLE_LABELS),
    removeLabel(MANAGEABLE_LABELS),
    unassign,
    markDraft,
    updateBranch,
  ],
};
