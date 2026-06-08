import type { Octokit } from "@octokit/rest";

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
