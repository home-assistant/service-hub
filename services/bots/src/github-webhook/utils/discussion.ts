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

export const addDiscussionReply = (
  context: WebhookContext<any>,
  discussionId: string,
  replyToId: string,
  body: string,
): Promise<unknown> =>
  context.github.graphql(
    `mutation ($discussionId: ID!, $replyToId: ID!, $body: String!) {
      addDiscussionComment(input: { discussionId: $discussionId, replyToId: $replyToId, body: $body }) {
        clientMutationId
      }
    }`,
    { discussionId, replyToId, body },
  );

// A discussion comment webhook payload only carries the numeric `parent_id`, not
// the parent's GraphQL node id (which markDiscussionCommentAsAnswer needs). Resolve
// it by paging through the discussion's comments until the matching one is found.
export const discussionCommentNodeId = async (
  context: WebhookContext<any>,
  discussionNumber: number,
  databaseId: number,
): Promise<string | undefined> => {
  let after: string | null = null;

  // Cap the paging to stay bounded even if the API keeps reporting more pages.
  for (let page = 0; page < 50; page++) {
    const result = (await context.github.graphql(
      `query ($owner: String!, $name: String!, $number: Int!, $after: String) {
        repository(owner: $owner, name: $name) {
          discussion(number: $number) {
            comments(first: 100, after: $after) {
              pageInfo { hasNextPage endCursor }
              nodes { id databaseId }
            }
          }
        }
      }`,
      { owner: context.repo().owner, name: context.repo().repo, number: discussionNumber, after },
    )) as {
      repository?: {
        discussion?: {
          comments?: {
            pageInfo?: { hasNextPage: boolean; endCursor: string | null };
            nodes?: { id: string; databaseId: number }[];
          };
        };
      };
    };

    const comments = result?.repository?.discussion?.comments;
    const match = comments?.nodes?.find((node) => node.databaseId === databaseId);
    if (match) {
      return match.id;
    }
    if (!comments?.pageInfo?.hasNextPage) {
      return undefined;
    }
    after = comments.pageInfo.endCursor;
  }

  return undefined;
};
