import {
  AuthTokenDetails,
  PostDetails,
  PostResponse,
  SocialCommentDTO,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { SocialAbstract } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { Integration } from '@prisma/client';
import { DiscordDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/discord.dto';
import { Tool } from '@gitroom/nestjs-libraries/integrations/tool.decorator';
import { getEnvOr } from '@gitroom/nestjs-libraries/integrations/credentials';
import { safeFetch } from '@gitroom/nestjs-libraries/dtos/webhooks/safe.fetch';

export class DiscordProvider extends SocialAbstract implements SocialProvider {
  override maxConcurrentJob = 5; // Discord has generous rate limits for webhook posting
  identifier = 'discord';
  name = 'Discord';
  isBetweenSteps = false;
  editor = 'markdown' as const;
  scopes = ['identify', 'guilds'];
  maxLength() {
    return 1980;
  }
  dto = DiscordDto;

  async refreshToken(refreshToken: string): Promise<AuthTokenDetails> {
    const { access_token, expires_in, refresh_token } = await (
      await this.fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        body: new URLSearchParams({
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(
            getEnvOr('DISCORD_CLIENT_ID', 'discord', 'clientId') +
              ':' +
              getEnvOr('DISCORD_CLIENT_SECRET', 'discord', 'clientSecret')
          ).toString('base64')}`,
        },
      })
    ).json();

    const { application } = await (
      await this.fetch('https://discord.com/api/oauth2/@me', {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      })
    ).json();

    return {
      refreshToken: refresh_token,
      expiresIn: expires_in,
      accessToken: access_token,
      id: '',
      name: application.name,
      picture: '',
      username: '',
    };
  }
  async generateAuthUrl() {
    const state = makeId(6);
    return {
      url: `https://discord.com/oauth2/authorize?client_id=${
        getEnvOr('DISCORD_CLIENT_ID', 'discord', 'clientId')
      }&permissions=377957124096&response_type=code&redirect_uri=${encodeURIComponent(
        `${process.env.FRONTEND_URL}/integrations/social/discord`
      )}&integration_type=0&scope=bot+identify+guilds&state=${state}`,
      codeVerifier: makeId(10),
      state,
    };
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    const { access_token, expires_in, refresh_token, scope, guild } = await (
      await this.fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        body: new URLSearchParams({
          code: params.code,
          grant_type: 'authorization_code',
          redirect_uri: `${process.env.FRONTEND_URL}/integrations/social/discord`,
        }),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(
            getEnvOr('DISCORD_CLIENT_ID', 'discord', 'clientId') +
              ':' +
              getEnvOr('DISCORD_CLIENT_SECRET', 'discord', 'clientSecret')
          ).toString('base64')}`,
        },
      })
    ).json();

    this.checkScopes(this.scopes, scope.split(' '));

    const { application } = await (
      await this.fetch('https://discord.com/api/oauth2/@me', {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      })
    ).json();

    return {
      id: guild.id,
      name: application.name,
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresIn: expires_in,
      picture: `https://cdn.discordapp.com/avatars/${application?.bot?.id}/${application?.bot?.avatar}.png`,
      username: application?.bot?.username,
    };
  }

  @Tool({ description: 'Channels', dataSchema: [] })
  async channels(accessToken: string, params: any, id: string) {
    const list = await (
      await this.fetch(`https://discord.com/api/guilds/${id}/channels`, {
        headers: {
          Authorization: `Bot ${getEnvOr('DISCORD_BOT_TOKEN_ID', 'discord', 'token')}`,
        },
      })
    ).json();

    return list
      .filter((p: any) => p.type === 0 || p.type === 5 || p.type === 15)
      .map((p: any) => ({
        id: String(p.id),
        name: p.name,
      }));
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails[]
  ): Promise<PostResponse[]> {
    const [firstPost] = postDetails;
    const channel = firstPost.settings.channel;

    const form = new FormData();
    form.append(
      'payload_json',
      JSON.stringify({
        content: firstPost.message.replace(/\[\[\[(@.*?)]]]/g, (match, p1) => {
          return `<${p1}>`;
        }),
        attachments: firstPost.media?.map((p, index) => ({
          id: index,
          description: `Picture ${index}`,
          filename: p.path.split('/').pop(),
        })),
      })
    );

    let index = 0;
    for (const media of firstPost.media || []) {
      const loadMedia = await safeFetch(media.path);

      form.append(
        `files[${index}]`,
        await loadMedia.blob(),
        media.path.split('/').pop()
      );
      index++;
    }

    const data = await (
      await this.fetch(`https://discord.com/api/channels/${channel}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bot ${getEnvOr('DISCORD_BOT_TOKEN_ID', 'discord', 'token')}`,
        },
        body: form,
      })
    ).json();

    return [
      {
        id: firstPost.id,
        releaseURL: `https://discord.com/channels/${id}/${channel}/${data.id}`,
        postId: data.id,
        status: 'success',
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

    // For Discord, we create a thread from the original message for comments
    // If we don't have a thread yet, create one
    let threadChannel = channel;

    // Create thread if this is the first comment
    if (!lastCommentId) {
      const { id: threadId } = await (
        await this.fetch(
          `https://discord.com/api/channels/${channel}/messages/${postId}/threads`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bot ${getEnvOr('DISCORD_BOT_TOKEN_ID', 'discord', 'token')}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: 'Thread',
              auto_archive_duration: 1440,
            }),
          }
        )
      ).json();
      threadChannel = threadId;
    }

    const form = new FormData();
    form.append(
      'payload_json',
      JSON.stringify({
        content: commentPost.message.replace(/\[\[\[(@.*?)]]]/g, (match, p1) => {
            return `<${p1}>`;
        }),
        attachments: commentPost.media?.map((p, index) => ({
          id: index,
          description: `Picture ${index}`,
          filename: p.path.split('/').pop(),
        })),
      })
    );

    let index = 0;
    for (const media of commentPost.media || []) {
      const loadMedia = await safeFetch(media.path);

      form.append(
        `files[${index}]`,
        await loadMedia.blob(),
        media.path.split('/').pop()
      );
      index++;
    }

    const data = await (
      await this.fetch(
        `https://discord.com/api/channels/${threadChannel}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bot ${getEnvOr('DISCORD_BOT_TOKEN_ID', 'discord', 'token')}`,
          },
          body: form,
        }
      )
    ).json();

    return [
      {
        id: commentPost.id,
        releaseURL: `https://discord.com/channels/${id}/${threadChannel}/${data.id}`,
        postId: data.id,
        status: 'success',
      },
    ];
  }

  async changeNickname(id: string, accessToken: string, name: string) {
    await (
      await this.fetch(`https://discord.com/api/guilds/${id}/members/@me`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bot ${getEnvOr('DISCORD_BOT_TOKEN_ID', 'discord', 'token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          nick: name,
        }),
      })
    ).json();

    return {
      name,
    };
  }

  override async mention(
    token: string,
    data: { query: string },
    id: string,
    integration: Integration
  ) {
    const allRoles = await (
      await this.fetch(`https://discord.com/api/guilds/${id}/roles`, {
        headers: {
          Authorization: `Bot ${getEnvOr('DISCORD_BOT_TOKEN_ID', 'discord', 'token')}`,
          'Content-Type': 'application/json',
        },
      })
    ).json();

    const matching = allRoles
      .filter((role: any) =>
        role.name.toLowerCase().includes(data.query.toLowerCase())
      )
      .filter((f: any) => f.name !== '@everyone' && f.name !== '@here');

    const list = await (
      await this.fetch(
        `https://discord.com/api/guilds/${id}/members/search?query=${data.query}`,
        {
          headers: {
            Authorization: `Bot ${getEnvOr('DISCORD_BOT_TOKEN_ID', 'discord', 'token')}`,
            'Content-Type': 'application/json',
          },
        }
      )
    ).json();

    return [
      ...[
        {
          id: String('here'),
          label: 'here',
          image: '',
          doNotCache: true,
        },
        {
          id: String('everyone'),
          label: 'everyone',
          image: '',
          doNotCache: true,
        },
      ].filter((role: any) => {
        return role.label.toLowerCase().includes(data.query.toLowerCase());
      }),
      ...matching.map((p: any) => ({
        id: String('&' + p.id),
        label: p.name.split('@')[1],
        image: '',
        doNotCache: true,
      })),
      ...list.map((p: any) => ({
        id: String(p.user.id),
        label: p.user.global_name || p.user.username,
        image: `https://cdn.discordapp.com/avatars/${p.user.id}/${p.user.avatar}.png`,
      })),
    ];
  }

  mentionFormat(idOrHandle: string, name: string) {
    if (name === '@here' || name === '@everyone') {
      return name;
    }
    return `[[[@${idOrHandle.replace('@', '')}]]]`;
  }

  override get commentsCapabilities() {
    return { read: true, reply: true, like: true };
  }

  async fetchComments(
    id: string,
    accessToken: string,
    postId: string,
    cursor: string | undefined,
    integration: Integration
  ): Promise<{ comments: SocialCommentDTO[]; nextCursor?: string }> {
    try {
      let url = `https://discord.com/api/channels/${id}/messages?limit=100`;
      if (cursor) {
        url += `&before=${cursor}`;
      }

      const response = await this.fetch(url, {
        headers: {
          Authorization: `Bot ${getEnvOr('DISCORD_BOT_TOKEN_ID', 'discord', 'token')}`,
        },
      });
      const messages = await response.json() as any[];

      const comments: SocialCommentDTO[] = (messages || []).map((msg: any) => ({
        platformCommentId: msg.id,
        author: {
          id: msg.author?.id || '',
          name: msg.author?.global_name || msg.author?.username || '',
          username: msg.author?.username,
          picture: msg.author?.avatar
            ? `https://cdn.discordapp.com/avatars/${msg.author.id}/${msg.author.avatar}.png`
            : undefined,
        },
        content: msg.content || '',
        createdAt: msg.timestamp,
        likeCount: msg.reactions?.reduce((sum: number, r: any) => sum + (r.count || 0), 0) || 0,
        raw: msg,
      }));

      const nextCursor = messages?.length > 0 ? messages[messages.length - 1].id : undefined;
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
    const channel = id;
    const response = await this.fetch(
      `https://discord.com/api/channels/${channel}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bot ${getEnvOr('DISCORD_BOT_TOKEN_ID', 'discord', 'token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: message,
          message_reference: { message_id: parentCommentId },
        }),
      }
    );
    const data = await response.json() as any;

    return {
      platformCommentId: data.id,
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
  }

  async likeComment(
    id: string,
    accessToken: string,
    postId: string,
    commentId: string,
    like: boolean,
    integration: Integration
  ): Promise<{ liked: boolean; likeCount?: number }> {
    try {
      const channel = id;
      const emoji = '👍';
      if (like) {
        await this.fetch(
          `https://discord.com/api/channels/${channel}/messages/${commentId}/reactions/${encodeURIComponent(emoji)}/@me`,
          { method: 'PUT' }
        );
      } else {
        await this.fetch(
          `https://discord.com/api/channels/${channel}/messages/${commentId}/reactions/${encodeURIComponent(emoji)}/@me`,
          { method: 'DELETE' }
        );
      }
      return { liked: like };
    } catch (err) {
      return { liked: like };
    }
  }

  override handleErrors(
    body: string
  ):
    | { type: 'refresh-token' | 'bad-body' | 'retry'; value: string }
    | undefined {
    if (body.includes('50001')) {
      return {
        type: 'bad-body',
        value: "Bot doesn't have access to this channel",
      };
    }

    if (body.includes('50013')) {
      return {
        type: 'bad-body',
        value: 'Bot lacks permission to send messages in this channel',
      };
    }

    if (body.includes('10003')) {
      return {
        type: 'bad-body',
        value: 'Channel no longer exists',
      };
    }

    if (body.includes('40005')) {
      return {
        type: 'bad-body',
        value: "Attachment exceeds Discord's size limit",
      };
    }

    if (body.includes('20028')) {
      return {
        type: 'retry',
        value: 'Rate limited by Discord',
      };
    }

    return undefined;
  }
}
