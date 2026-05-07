import type { Octokit } from "@octokit/rest";
import type { GetIssueLabelParams, GetIssueLabelResponse } from "./types.js";

export async function issuesGetLabel(
  github: Octokit,
  params: GetIssueLabelParams,
): Promise<GetIssueLabelResponse | undefined> {
  try {
    const response = await github.issues.getLabel(params);
    if (response.status === 200) {
      return response.data;
    }
  } catch {
    // GitHub sometimes responds with 404 directly,
    // sometimes it does not, and only changes the response.status to 404
  }
}

export async function convertPullRequestToDraft(github: Octokit, nodeId: string): Promise<void> {
  await github.graphql(
    "mutation($id: ID!) { convertPullRequestToDraft(input: {pullRequestId: $id}) { clientMutationId } }",
    { id: nodeId },
  );
}

export async function markPullRequestReadyForReview(
  github: Octokit,
  nodeId: string,
): Promise<void> {
  await github.graphql(
    "mutation($id: ID!) { markPullRequestReadyForReview(input: {pullRequestId: $id}) { clientMutationId } }",
    { id: nodeId },
  );
}
