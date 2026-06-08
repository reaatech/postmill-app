import { PostActivity } from '@gitroom/orchestrator/activities/post.activity';
import {
  ActivityFailure,
  ApplicationFailure,
  startChild,
  proxyActivities,
  uuid4,
  sleep,
  defineSignal,
  setHandler,
} from '@temporalio/workflow';
import dayjs from 'dayjs';
import { Integration } from '@prisma/client';
import { capitalize, sortBy } from 'lodash';
import { PostResponse } from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { TypedSearchAttributes } from '@temporalio/common';
import { postId as postIdSearchParam } from '@gitroom/nestjs-libraries/temporal/temporal.search.attribute';

const proxyTaskQueue = (taskQueue: string) => {
  return proxyActivities<PostActivity>({
    startToCloseTimeout: '10 minute',
    taskQueue,
    retry: {
      maximumAttempts: 3,
      backoffCoefficient: 1,
      initialInterval: '2 minutes',
    },
  });
};

const {
  getPostsList,
  getPost,
  inAppNotification,
  changeState,
  updatePost,
  updatePostSettings,
  sendWebhooks,
  isCommentable,
  supportsFirstComment,
} = proxyActivities<PostActivity>({
  startToCloseTimeout: '10 minute',
  retry: {
    maximumAttempts: 3,
    backoffCoefficient: 1,
    initialInterval: '2 minutes',
  },
});

const poke = defineSignal('poke');

const iterate = Array.from({ length: 5 });

export async function postWorkflowV106({
  taskQueue,
  postId,
  organizationId,
  postNow = false,
}: {
  taskQueue: string;
  postId: string;
  organizationId: string;
  postNow?: boolean;
}) {
  const {
    postSocial,
    postComment,
    postFirstComment,
    getIntegrationById,
    refreshTokenWithCause,
    internalPlugs,
    globalPlugs,
    processInternalPlug,
    processPlug,
  } = proxyTaskQueue(taskQueue);

  let poked = false;
  setHandler(poke, () => {
    poked = true;
  });

  const startTime = new Date();
  const firstPost = await getPost(organizationId, postId);

  if (!firstPost) {
    await changeState(postId, 'ERROR', 'No Post');
    return;
  }

  if (!postNow && firstPost.state !== 'QUEUE') {
    await changeState(firstPost.id, 'ERROR', 'Already posted', [firstPost]);
    return;
  }

  if (!postNow) {
    await sleep(
      dayjs(firstPost.publishDate).isBefore(dayjs())
        ? 0
        : dayjs(firstPost.publishDate).diff(dayjs(), 'millisecond')
    );
  }

  const postsListBefore = await getPostsList(organizationId, postId);
  const [post] = postsListBefore;

  if (!post) {
    await changeState(postId, 'ERROR', 'No Post');
    return;
  }

  if (post.integration?.refreshNeeded) {
    await inAppNotification(
      post.organizationId,
      `We couldn't post to ${post.integration?.providerIdentifier} for ${post?.integration?.name}`,
      `We couldn't post to ${post.integration?.providerIdentifier} for ${post?.integration?.name} because you need to reconnect it. Please enable it and try again.`,
      true,
      false,
      'info'
    );

    await changeState(
      postsListBefore[0].id,
      'ERROR',
      'Refresh channel needed',
      postsListBefore
    );
    return;
  }

  if (post.integration?.disabled) {
    await inAppNotification(
      post.organizationId,
      `We couldn't post to ${post.integration?.providerIdentifier} for ${post?.integration?.name}`,
      `We couldn't post to ${post.integration?.providerIdentifier} for ${post?.integration?.name} because it's disabled. Please enable it and try again.`,
      true,
      false,
      'info'
    );

    await changeState(
      postsListBefore[0].id,
      'ERROR',
      'Channel disabled',
      postsListBefore
    );
    return;
  }

  const toComment: boolean =
    postsListBefore.length === 1
      ? false
      : await isCommentable(post.integration);

  const postsList = toComment ? postsListBefore : [postsListBefore[0]];

  const postsResults: PostResponse[] = [];

  for (let i = 0; i < postsList.length; i++) {
    const before = postsResults.length;
    for (const _ of iterate) {
      try {
        if (i === 0) {
          postsResults.push(
            ...(await postSocial(post.integration as Integration, [
              postsList[i],
            ]))
          );
        } else {
          if (postsList[i].delay) {
            await sleep(60000 * Math.max(0, Number(postsList[i].delay ?? 0)));
          }

          postsResults.push(
            ...(await postComment(
              postsResults[0].postId,
              postsResults.length === 1
                ? undefined
                : postsResults[i - 1].postId,
              post.integration,
              [postsList[i]]
            ))
          );
        }

        await updatePost(
          postsList[i].id,
          postsResults[i].postId,
          postsResults[i].releaseURL
        );

        if (i === 0) {
          await inAppNotification(
            post.integration.organizationId,
            `Your post has been published on ${capitalize(
              post.integration.providerIdentifier
            )}`,
            `Your post has been published on ${capitalize(
              post.integration.providerIdentifier
            )} at ${postsResults[0].releaseURL}`,
            true,
            true
          );
        }

        break;
      } catch (err) {
        if (
          err instanceof ActivityFailure &&
          err.cause instanceof ApplicationFailure &&
          err.cause.type === 'refresh_token'
        ) {
          const refresh = await refreshTokenWithCause(
            post.integration,
            err?.cause?.message || ''
          );
          if (!refresh || !refresh.accessToken) {
            await changeState(postsList[0].id, 'ERROR', err, postsList);
            return false;
          }

          post.integration.token = refresh.accessToken;
          continue;
        }

        await changeState(postsList[0].id, 'ERROR', err, postsList);

        if (
          err instanceof ActivityFailure &&
          err.cause instanceof ApplicationFailure &&
          err.cause.type === 'bad_body'
        ) {
          await inAppNotification(
            post.organizationId,
            `Error posting${i === 0 ? ' ' : ' comments '}on ${
              post.integration?.providerIdentifier
            } for ${post?.integration?.name}`,
            `An error occurred while posting${i === 0 ? ' ' : ' comments '}on ${
              post.integration?.providerIdentifier
            }${err?.cause?.message ? `: ${err?.cause?.message}` : ``}`,
            true,
            false,
            'fail'
          );
          return false;
        }
      }
    }

    if (postsResults.length === before) {
      return false;
    }
  }

  // First Comment (2F) — auto-post the first comment after successful publish
  // Non-fatal: catch error, mark warning, post stays published
  try {
    if (typeof globalThis !== 'undefined' && (globalThis as any).Sentry) {
      (globalThis as any).Sentry.addBreadcrumb({
        category: 'workflow',
        message: 'Posting first comment',
        level: 'info',
        data: { postId, organizationId },
      });
    }
    const parsedSettings = JSON.parse(post.settings);
    const firstComment = parsedSettings?.firstComment;
    const alreadyPosted =
      parsedSettings?.firstCommentPostedAt || parsedSettings?.firstCommentId;

    if (firstComment && !alreadyPosted && postsResults.length > 0) {
      const supports = await supportsFirstComment(post.integration);
      if (!supports) {
        await inAppNotification(
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
        const firstCommentResult = await postFirstComment(
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

        await updatePostSettings(
          postsList[0].id,
          JSON.stringify(updatedSettings)
        );
      }
    }
  } catch (err) {
    await inAppNotification(
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

  await sendWebhooks(
    postsResults[0].postId,
    post.organizationId,
    post.integration.id
  );

  const internalPlugsList = await internalPlugs(
    post.integration,
    JSON.parse(post.settings)
  );

  const globalPlugsList = (await globalPlugs(post.integration)).reduce(
    (all, current) => {
      for (let i = 1; i <= current.totalRuns; i++) {
        all.push({
          ...current,
          delay: current.delay * i,
        });
      }

      return all;
    },
    []
  );

  const repeatPost = !post.intervalInDays
    ? []
    : [
        {
          type: 'repeat-post',
          delay:
            post.intervalInDays * 24 * 60 * 60 * 1000 -
            (new Date().getTime() - startTime.getTime()),
        },
      ];

  const list = sortBy(
    [...internalPlugsList, ...globalPlugsList, ...repeatPost],
    'delay'
  );

  while (list.length > 0) {
    const todo = list.shift();

    await sleep(Math.max(0, Number(todo.delay ?? 0)));

    if (todo.type === 'internal-plug') {
      for (const _ of iterate) {
        try {
          await processInternalPlug({ ...todo, post: postsResults[0].postId });
        } catch (err) {
          if (
            err instanceof ActivityFailure &&
            err.cause instanceof ApplicationFailure &&
            err.cause.type === 'refresh_token'
          ) {
            const refresh = await refreshTokenWithCause(
              await getIntegrationById(organizationId, todo.integration),
              err?.cause?.message || ''
            );
            if (!refresh || !refresh.accessToken) {
              break;
            }

            continue;
          }

          if (
            err instanceof ActivityFailure &&
            err.cause instanceof ApplicationFailure &&
            err.cause.type === 'bad_body'
          ) {
            break;
          }

          continue;
        }
        break;
      }
    }

    if (todo.type === 'global') {
      for (const _ of iterate) {
        try {
          const process = await processPlug({
            ...todo,
            postId: postsResults[0].postId,
          });
          if (process) {
            const toDelete = list
              .reduce((all, current, index) => {
                if (current.plugId === todo.plugId) {
                  all.push(index);
                }

                return all;
              }, [])
              .reverse();

            for (const index of toDelete) {
              list.splice(index, 1);
            }
          }
        } catch (err) {
          if (
            err instanceof ActivityFailure &&
            err.cause instanceof ApplicationFailure &&
            err.cause.type === 'refresh_token'
          ) {
            const refresh = await refreshTokenWithCause(
              post.integration,
              err?.cause?.message || ''
            );
            if (!refresh || !refresh.accessToken) {
              break;
            }

            continue;
          }

          if (
            err instanceof ActivityFailure &&
            err.cause instanceof ApplicationFailure &&
            err.cause.type === 'bad_body'
          ) {
            break;
          }

          continue;
        }

        break;
      }
    }

    if (todo.type === 'repeat-post') {
      await startChild(postWorkflowV106, {
        parentClosePolicy: 'ABANDON',
        args: [
          {
            taskQueue,
            postId,
            organizationId,
            postNow: true,
          },
        ],
        workflowId: `post_${post.id}_${uuid4()}`,
        typedSearchAttributes: new TypedSearchAttributes([
          {
            key: postIdSearchParam,
            value: postId,
          },
        ]),
      });
    }
  }
}
