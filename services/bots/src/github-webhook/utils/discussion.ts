import { WebhookContext } from '../github-webhook.model';

export type DiscussionCloseReason = 'RESOLVED' | 'OUTDATED' | 'DUPLICATE';

export const closeDiscussion = (
  context: WebhookContext<any>,
  discussionId: string,
  reason: DiscussionCloseReason,
): Promise<unknown> =>
  context.github.graphql(
    `mutation ($id: ID!, $reason: DiscussionCloseReason!) {
      closeDiscussion(input: { discussionId: $id, reason: $reason }) { clientMutationId }
    }`,
    { id: discussionId, reason },
  );

export const reopenDiscussion = (
  context: WebhookContext<any>,
  discussionId: string,
): Promise<unknown> =>
  context.github.graphql(
    `mutation ($id: ID!) {
      reopenDiscussion(input: { discussionId: $id }) { clientMutationId }
    }`,
    { id: discussionId },
  );

export const markDiscussionCommentAsAnswer = (
  context: WebhookContext<any>,
  commentId: string,
): Promise<unknown> =>
  context.github.graphql(
    `mutation ($id: ID!) {
      markDiscussionCommentAsAnswer(input: { id: $id }) { clientMutationId }
    }`,
    { id: commentId },
  );

export const updateDiscussionTitle = (
  context: WebhookContext<any>,
  discussionId: string,
  title: string,
): Promise<unknown> =>
  context.github.graphql(
    `mutation ($id: ID!, $title: String!) {
      updateDiscussion(input: { discussionId: $id, title: $title }) { clientMutationId }
    }`,
    { id: discussionId, title },
  );

export const addDiscussionCommentReaction = (
  context: WebhookContext<any>,
  commentId: string,
  positive: boolean,
): Promise<unknown> =>
  context.github.graphql(
    `mutation ($id: ID!, $content: ReactionContent!) {
      addReaction(input: { subjectId: $id, content: $content }) { clientMutationId }
    }`,
    { id: commentId, content: positive ? 'THUMBS_UP' : 'THUMBS_DOWN' },
  );

// A discussion comment webhook payload only carries the numeric `parent_id`, not
// the parent's GraphQL node id (which markDiscussionCommentAsAnswer needs). Resolve
// it from the discussion's comments. Only top-level comments can be answers, so the
// parent is always within the first page.
export const discussionCommentNodeId = async (
  context: WebhookContext<any>,
  discussionNumber: number,
  databaseId: number,
): Promise<string | undefined> => {
  const result = (await context.github.graphql(
    `query ($owner: String!, $name: String!, $number: Int!) {
      repository(owner: $owner, name: $name) {
        discussion(number: $number) { comments(first: 100) { nodes { id databaseId } } }
      }
    }`,
    { owner: context.repo().owner, name: context.repo().repo, number: discussionNumber },
  )) as {
    repository?: { discussion?: { comments?: { nodes?: { id: string; databaseId: number }[] } } };
  };

  return result?.repository?.discussion?.comments?.nodes?.find(
    (node) => node.databaseId === databaseId,
  )?.id;
};
