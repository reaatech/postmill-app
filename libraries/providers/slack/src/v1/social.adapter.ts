import {
  AuthTokenDetails,
  ClientInformation,
  PostDetails,
  PostResponse,
  SocialCommentDTO,
  SocialProvider,
} from '@gitroom/provider-kernel';
import { makeId } from '@gitroom/provider-kernel';
import { SocialAbstract } from '@gitroom/provider-kernel';
import dayjs from 'dayjs';
import { Integration } from '@prisma/client';
import { SlackDto } from '@gitroom/provider-kernel';
import { Tool } from '@gitroom/provider-kernel';

import { metadata as providerMetadata } from './metadata';
export class SlackProvider extends SocialAbstract implements SocialProvider {
  override maxConcurrentJob = 3; // Slack has moderate API limits
  identifier = 'slack';
  name = 'Slack';
  isBetweenSteps = false;
  editor = 'normal' as const;
  scopes = [
    'channels:read',
    'chat:write',
    'users:read',
    'groups:read',
    'channels:join',
    'chat:write.customize',
  ];
  dto = SlackDto;

  maxLength() {
    return 400000;
  }

  async refreshToken(refreshToken: string): Promise<AuthTokenDetails> {
    return {
      refreshToken: '',
      expiresIn: 1000000,
      accessToken: '',
      id: '',
      name: '',
      picture: '',
      username: '',
    };
  }
  async generateAuthUrl(clientInformation?: ClientInformation) {
    const state = makeId(6);

    return {
      url: `https://slack.com/oauth/v2/authorize?client_id=${
        clientInformation?.client_id || ''
      }&redirect_uri=${encodeURIComponent(
        `${
          process?.env?.FRONTEND_URL?.indexOf('https') === -1
            ? 'https://redirectmeto.com/'
            : ''
        }${process?.env?.FRONTEND_URL}/integrations/social/slack`
      )}&scope=channels:read,chat:write,users:read,groups:read,channels:join,chat:write.customize&state=${state}`,
      codeVerifier: makeId(10),
      state,
    };
  }

  async authenticate(
    params: {
      code: string;
      codeVerifier: string;
      refresh?: string;
    },
    clientInformation?: ClientInformation
  ) {
    const { access_token, team, bot_user_id, scope } = await (
      await this.fetch(`https://slack.com/api/oauth.v2.access`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: clientInformation?.client_id || '',
          client_secret: clientInformation?.client_secret || '',
          code: params.code,
          redirect_uri: `${
            process?.env?.FRONTEND_URL?.indexOf('https') === -1
              ? 'https://redirectmeto.com/'
              : ''
          }${process?.env?.FRONTEND_URL}/integrations/social/slack${
            params.refresh ? `?refresh=${params.refresh}` : ''
          }`,
        }),
      })
    ).json();

    this.checkScopes(this.scopes, scope.split(','));

    const { user } = await (
      await fetch(`https://slack.com/api/users.info?user=${bot_user_id}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      })
    ).json();

    return {
      id: team.id,
      name: user.real_name,
      accessToken: access_token,
      refreshToken: 'null',
      expiresIn: dayjs().add(100, 'years').unix() - dayjs().unix(),
      picture: user?.profile?.image_original || '',
      username: user.name,
    };
  }

  @Tool({
    description: 'Get list of channels',
    dataSchema: [],
  })
  async channels(accessToken: string, params: any, id: string) {
    const list = await (
      await fetch(
        `https://slack.com/api/conversations.list?types=public_channel,private_channel`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      )
    ).json();

    return list.channels.map((p: any) => ({
      id: p.id,
      name: p.name,
    }));
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const [firstPost] = postDetails;
    const channel = firstPost.settings.channel;

    // Join the channel first
    await fetch(`https://slack.com/api/conversations.join`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel,
      }),
    });

    // Post the main message
    const { ts, channel: responseChannel } = await (
      await fetch(`https://slack.com/api/chat.postMessage`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel,
          username: integration.name,
          icon_url: integration.picture,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: firstPost.message,
              },
            },
            ...(firstPost.media?.length
              ? firstPost.media.map((m) => ({
                  type: 'image',
                  image_url: m.path,
                  alt_text: '',
                }))
              : []),
          ],
        }),
      })
    ).json();

    // Get permalink for the message
    const { permalink } = await (
      await fetch(
        `https://slack.com/api/chat.getPermalink?channel=${responseChannel}&message_ts=${ts}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      )
    ).json();

    return [
      {
        id: firstPost.id,
        postId: ts,
        releaseURL: permalink || '',
        status: 'posted',
      },
    ];
  }

  async comment(
    id: string,
    postId: string,
    lastCommentId: string | undefined,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const [commentPost] = postDetails;
    const channel = commentPost.settings.channel;
    const threadTs = lastCommentId || postId;

    // Post the threaded reply
    const { ts, channel: responseChannel } = await (
      await fetch(`https://slack.com/api/chat.postMessage`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel,
          username: integration.name,
          icon_url: integration.picture,
          thread_ts: threadTs,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: commentPost.message,
              },
            },
            ...(commentPost.media?.length
              ? commentPost.media.map((m) => ({
                  type: 'image',
                  image_url: m.path,
                  alt_text: '',
                }))
              : []),
          ],
        }),
      })
    ).json();

    // Get permalink for the comment
    const { permalink } = await (
      await fetch(
        `https://slack.com/api/chat.getPermalink?channel=${responseChannel}&message_ts=${ts}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      )
    ).json();

    return [
      {
        id: commentPost.id,
        postId: ts,
        releaseURL: permalink || '',
        status: 'posted',
      },
    ];
  }

  override get commentsCapabilities() {
    return { read: true, reply: true, like: false };
  }

  async fetchComments(
    id: string,
    accessToken: string,
    postId: string,
    cursor: string | undefined,
    integration: Integration
  ): Promise<{ comments: SocialCommentDTO[]; nextCursor?: string }> {
    try {
      const channel = id;
      let url = `https://slack.com/api/conversations.replies?channel=${channel}&ts=${postId}&limit=100`;
      if (cursor) {
        url += `&cursor=${cursor}`;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const json = await response.json() as any;
      const messages = json?.messages || [];

      const comments: SocialCommentDTO[] = messages
        .filter((m: any) => m.ts !== postId)
        .map((msg: any) => ({
          platformCommentId: msg.ts,
          parentPlatformCommentId: postId,
          author: {
            id: msg.user || msg.bot_id || '',
            name: msg.username || msg.bot_id || '',
            username: msg.username,
          },
          content: msg.text || '',
          createdAt: new Date(parseFloat(msg.ts) * 1000).toISOString(),
          raw: msg,
        }));

      const nextCursor = json?.response_metadata?.next_cursor;
      return { comments, nextCursor };
    } catch (err) {
      return { comments: [] };
    }
  }

  async replyToComment(
    id: string,
    accessToken: string,
    postId: string,
    parentCommentId: string,
    message: string,
    integration: Integration
  ): Promise<SocialCommentDTO> {
    try {
      const channel = id;
      const response = await fetch(`https://slack.com/api/chat.postMessage`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel,
          thread_ts: parentCommentId,
          text: message,
          username: integration.name,
          icon_url: integration.picture,
        }),
      });
      const json = await response.json() as any;

      return {
        platformCommentId: json.ts || '',
        parentPlatformCommentId: parentCommentId,
        author: {
          id: integration.internalId,
          name: integration.name,
          username: integration.profile,
          picture: integration.picture,
        },
        content: message,
        createdAt: new Date().toISOString(),
      };
    } catch (err) {
      return {
        platformCommentId: '',
        parentPlatformCommentId: parentCommentId,
        author: {
          id: integration?.internalId || '',
          name: integration?.name || '',
        },
        content: message,
        createdAt: new Date().toISOString(),
      };
    }
  }

  async likeComment(
    id: string,
    accessToken: string,
    postId: string,
    commentId: string,
    like: boolean,
    integration: Integration
  ): Promise<{ liked: boolean; likeCount?: number }> {
    // Platform does not support native comment likes
    return { liked: like };
  }

  async changeProfilePicture(id: string, accessToken: string, url: string) {
    return {
      url,
    };
  }

  async changeNickname(id: string, accessToken: string, name: string) {
    return {
      name,
    };
  }
}

// ---- provider-kernel module (relocated step 7.5.1) ----
import {
  ProviderModule as __ProviderModule,
  SocialProviderKernelAdapter as __Bridge,
  PROVIDER_CAPABILITIES as __CAPS,
} from '@gitroom/provider-kernel';

const __adapter = new SlackProvider();

export const slackSocialModule: __ProviderModule<any, any> = {
  metadata: providerMetadata,
  manifest: {
    domain: 'social',
    providerId: __adapter.identifier,
    version: 'v1',
    displayName: __adapter.name,
    status: 'active',
    credentialFields: [],
    capabilities: (__CAPS as any)[__adapter.identifier] || {},
  },
  create: (ctx) => new __Bridge(__adapter, ctx),
};
