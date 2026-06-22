import { inngest } from '@gitroom/nestjs-libraries/inngest/inngest.client';
import { PostActivity } from '@gitroom/nestjs-libraries/inngest/activities/post.activity';
import {
  RefreshTokenError,
  BadBodyError,
} from '@gitroom/nestjs-libraries/inngest/errors';
import { socialIntegrationList } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import dayjs from 'dayjs';
import { Integration } from '@prisma/client';
import { capitalize, sortBy } from 'lodash';
import { v4 as uuidv4 } from 'uuid';

const MAX_RETRIES = 5;

/**
 * Temporal enforced a per-provider task queue with `maxConcurrentTaskExecutions`.
 * Inngest's `concurrency.limit` is static per function definition, so we generate
 * one function per unique task-queue (provider base identifier) and use the most
 * conservative `maxConcurrentJob` when multiple provider variants share a queue
 * (e.g. `instagram` and `instagram-standalone` both map to `instagram`).
 */
const taskQueueLimits = socialIntegrationList.reduce((acc, provider) => {
  const base = provider.identifier.split('-')[0].toLowerCase();
  const limit = provider.maxConcurrentJob ?? 1;
  const existing = acc.get(base);
  if (existing === undefined || limit < existing) {
    acc.set(base, limit);
  }
  return acc;
}, new Map<string, number>());

const runPostPublish = (postActivity: PostActivity) =>
  async ({ step, event }: any) => {
    const { postId, organizationId, taskQueue, maxConcurrentJob, postNow = false } = event.data;
    const startTime = new Date();

    const firstPost = await step.run('get-post', () =>
      postActivity.getPost(organizationId, postId)
    );

    if (!firstPost) {
      await step.run('mark-error-no-post', () =>
        postActivity.changeState(postId, 'ERROR', 'No Post')
      );
      return;
    }

    if (!postNow && (firstPost as any).state !== 'QUEUE') {
      await step.run('mark-error-already-posted', () =>
        postActivity.changeState(
          (firstPost as any).id,
          'ERROR',
          'Already posted',
          [firstPost]
        )
      );
      return;
    }

    if (!postNow) {
      const publishDate = dayjs((firstPost as any).publishDate);
      const sleepMs = publishDate.isBefore(dayjs())
        ? 0
        : publishDate.diff(dayjs(), 'millisecond');
      await step.sleep('wait-until-publish-date', sleepMs);
    }

    const postsListBefore = await step.run('get-posts-list', () =>
      postActivity.getPostsList(organizationId, postId)
    );
    const [post] = postsListBefore;

    if (!post) {
      await step.run('mark-error-no-post-list', () =>
        postActivity.changeState(postId, 'ERROR', 'No Post')
      );
      return;
    }

    if (post.integration?.refreshNeeded) {
      await step.run('notify-refresh-needed', () =>
        postActivity.inAppNotification(
          post.organizationId,
          `We couldn't post to ${post.integration?.providerIdentifier} for ${post?.integration?.name}`,
          `We couldn't post to ${post.integration?.providerIdentifier} for ${post?.integration?.name} because you need to reconnect it. Please enable it and try again.`,
          true,
          false,
          'info'
        )
      );
      await step.run('mark-error-refresh-needed', () =>
        postActivity.changeState(
          postsListBefore[0].id,
          'ERROR',
          'Refresh channel needed',
          postsListBefore
        )
      );
      return;
    }

    if (post.integration?.disabled) {
      await step.run('notify-disabled', () =>
        postActivity.inAppNotification(
          post.organizationId,
          `We couldn't post to ${post.integration?.providerIdentifier} for ${post?.integration?.name}`,
          `We couldn't post to ${post.integration?.providerIdentifier} for ${post?.integration?.name} because it's disabled. Please enable it and try again.`,
          true,
          false,
          'info'
        )
      );
      await step.run('mark-error-disabled', () =>
        postActivity.changeState(
          postsListBefore[0].id,
          'ERROR',
          'Channel disabled',
          postsListBefore
        )
      );
      return;
    }

    const toComment: boolean =
      postsListBefore.length === 1
        ? false
        : await step.run('is-commentable', () =>
            postActivity.isCommentable(post.integration)
          );

    const postsList = toComment ? postsListBefore : [postsListBefore[0]];
    const postsResults: any[] = [];

    for (let i = 0; i < postsList.length; i++) {
      const before = postsResults.length;

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          if (i === 0) {
            const result = await step.run('post-social', () =>
              postActivity.postSocial(post.integration as Integration, [
                postsList[i],
              ])
            );
            postsResults.push(...result);
          } else {
            if (postsList[i].delay) {
              await step.sleep(
                'wait-comment-delay',
                60000 * Math.max(0, Number(postsList[i].delay ?? 0))
              );
            }

            const result = await step.run('post-comment', () =>
              postActivity.postComment(
                postsResults[0].postId,
                postsResults.length === 1
                  ? undefined
                  : postsResults[i - 1].postId,
                post.integration,
                [postsList[i]]
              )
            );
            postsResults.push(...result);
          }

          await step.run('update-post', () =>
            postActivity.updatePost(
              postsList[i].id,
              postsResults[i].postId,
              postsResults[i].releaseURL
            )
          );

          if (i === 0) {
            await step.run('notify-published', () =>
              postActivity.inAppNotification(
                post.integration.organizationId,
                `Your post has been published on ${capitalize(
                  post.integration.providerIdentifier
                )}`,
                `Your post has been published on ${capitalize(
                  post.integration.providerIdentifier
                )} at ${postsResults[0].releaseURL}`,
                true,
                true
              )
            );
          }

          break;
        } catch (err) {
          if (err instanceof RefreshTokenError) {
            const refresh = await step.run('refresh-token', () =>
              postActivity.refreshTokenWithCause(
                post.integration,
                err?.message || ''
              )
            );
            if (!refresh || !refresh.accessToken) {
              await step.run('mark-error-refresh-failed', () =>
                postActivity.changeState(
                  postsList[0].id,
                  'ERROR',
                  err,
                  postsList
                )
              );
              return;
            }
            post.integration.token = refresh.accessToken;
            continue;
          }

          await step.run('mark-error', () =>
            postActivity.changeState(postsList[0].id, 'ERROR', err, postsList)
          );

          if (err instanceof BadBodyError) {
            await step.run('notify-bad-body', () =>
              postActivity.inAppNotification(
                post.organizationId,
                `Error posting${i === 0 ? ' ' : ' comments '}on ${
                  post.integration?.providerIdentifier
                } for ${post?.integration?.name}`,
                `An error occurred while posting${
                  i === 0 ? ' ' : ' comments '
                }on ${post.integration?.providerIdentifier}${
                  err?.message ? `: ${err?.message}` : ``
                }`,
                true,
                false,
                'fail'
              )
            );
            return;
          }

          return;
        }
      }

      if (postsResults.length === before) {
        return;
      }
    }

    // First Comment (2F) — auto-post the first comment after successful publish
    await step.run('first-comment', async () => {
      try {
        const parsedSettings = JSON.parse(post.settings);
        const firstComment = parsedSettings?.firstComment;
        const alreadyPosted =
          parsedSettings?.firstCommentPostedAt ||
          parsedSettings?.firstCommentId;

        if (firstComment && !alreadyPosted && postsResults.length > 0) {
          const supports = await postActivity.supportsFirstComment(
            post.integration
          );
          if (!supports) {
            await postActivity.inAppNotification(
              post.organizationId,
              `First comment is not supported on ${capitalize(
                post.integration?.providerIdentifier
              )}`,
              `The post was published successfully, but ${capitalize(
                post.integration?.providerIdentifier
              )} does not support first comments. Please add the comment manually if the platform allows it.`,
              true,
              false,
              'info'
            );
          } else {
            const firstCommentResult = await postActivity.postFirstComment(
              postsResults[0].postId,
              post.integration,
              firstComment
            );

            const postedComment = Array.isArray(firstCommentResult)
              ? firstCommentResult[0]
              : undefined;
            const updatedSettings = {
              ...parsedSettings,
              firstCommentId: postedComment?.postId,
              firstCommentReleaseURL: postedComment?.releaseURL,
              firstCommentPostedAt: new Date().toISOString(),
            };

            await postActivity.updatePostSettings(
              postsList[0].id,
              JSON.stringify(updatedSettings)
            );
          }
        }
      } catch (err) {
        await postActivity.inAppNotification(
          post.organizationId,
          `First comment could not be posted on ${capitalize(
            post.integration?.providerIdentifier
          )}`,
          `The post was published successfully, but the first comment could not be posted on ${capitalize(
            post.integration?.providerIdentifier
          )}. Please add the comment manually.`,
          true,
          false,
          'fail'
        );
      }
    }).catch(() => {});

    await step.run('send-webhooks', () =>
      postActivity.sendWebhooks(
        postsResults[0].postId,
        post.organizationId,
        post.integration.id
      )
    );

    const internalPlugsList = await step.run('internal-plugs', () =>
      postActivity.internalPlugs(post.integration, JSON.parse(post.settings))
    );

    const globalPlugsList = await step.run('global-plugs', () =>
      postActivity.globalPlugs(post.integration)
    );

    const repeatPost = !post.intervalInDays
      ? []
      : [
          {
            type: 'repeat-post' as const,
            delay:
              post.intervalInDays * 24 * 60 * 60 * 1000 -
              (new Date().getTime() - startTime.getTime()),
          },
        ];

    let list = sortBy(
      [
        ...internalPlugsList,
        ...globalPlugsList.map((current: any) =>
          Array.from({ length: current.totalRuns }).map((_, idx) => ({
            ...current,
            delay: current.delay * (idx + 1),
          }))
        ).flat(),
        ...repeatPost,
      ],
      'delay'
    );

    let plugIndex = 0;
    while (list.length > 0) {
      const todo = list.shift();
      const currentIndex = plugIndex++;
      await step.sleep(`wait-plug-delay-${currentIndex}`, Math.max(0, Number(todo.delay ?? 0)));

      if (todo.type === 'internal-plug') {
        await step.run(`process-internal-plug-${currentIndex}`, async () => {
          let integration = post.integration;
          for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
              await postActivity.processInternalPlug({
                ...todo,
                post: postsResults[0].postId,
              } as any);
              break;
            } catch (err) {
              if (err instanceof RefreshTokenError && attempt < MAX_RETRIES - 1) {
                integration = await postActivity.getIntegrationById(
                  organizationId,
                  todo.integration
                );
                const refresh = await postActivity.refreshTokenWithCause(
                  integration,
                  err?.message || ''
                );
                if (!refresh || !refresh.accessToken) {
                  break;
                }
                continue;
              }
              if (err instanceof BadBodyError) {
                break;
              }
              break;
            }
          }
        });
      }

      if (todo.type === 'global') {
        const process = await step.run(`process-global-plug-${currentIndex}`, async () => {
          const integration = post.integration;
          for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
              return await postActivity.processPlug({
                ...todo,
                postId: postsResults[0].postId,
              } as any);
            } catch (err) {
              if (err instanceof RefreshTokenError && attempt < MAX_RETRIES - 1) {
                const refresh = await postActivity.refreshTokenWithCause(
                  integration,
                  err?.message || ''
                );
                if (!refresh || !refresh.accessToken) {
                  return false;
                }
                continue;
              }
              if (err instanceof BadBodyError) {
                return false;
              }
              return false;
            }
          }
          return false;
        });
        if (process) {
          list = list.filter((current: any) => current.plugId !== todo.plugId);
        }
      }

      if (todo.type === 'repeat-post') {
        await step.sendEvent(`repeat-post-${currentIndex}`, {
          name: 'post/publish',
          data: {
            taskQueue,
            postId,
            organizationId,
            maxConcurrentJob,
            postNow: true,
          },
          id: `post_${post.id}_${uuidv4()}`,
        });
      }
    }
  };

export const createPostPublishFunctions = (postActivity: PostActivity) =>
  Array.from(taskQueueLimits.entries()).map(([taskQueue, limit]) =>
    inngest.createFunction(
      {
        id: `post-publish-${taskQueue}`,
        concurrency: { limit },
        cancelOn: [
          {
            event: 'post/cancel',
            if: 'async.data.postId == event.data.postId',
          },
        ],
      },
      { event: 'post/publish', if: `event.data.taskQueue == "${taskQueue}"` },
      runPostPublish(postActivity)
    )
  );
