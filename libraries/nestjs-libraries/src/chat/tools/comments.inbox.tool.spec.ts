import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { CommentsInboxTool } from './comments.inbox.tool';
import { executeTool, makeOrganization, makeUser } from './__tests__/tool-test.harness';

describe('CommentsInboxTool', () => {
  const org = makeOrganization();
  const user = makeUser();

  function makeComment(overrides: Record<string, any> = {}) {
    return {
      id: 'comment-1',
      postId: 'post-1',
      integrationId: 'int-1',
      platformCommentId: 'platform-comment-1',
      parentPlatformCommentId: null,
      authorName: 'Alice',
      authorUsername: 'alice',
      authorPicture: 'https://example.com/alice.png',
      content: 'Great post!',
      likeCount: 5,
      replyCount: 1,
      likedByMe: false,
      isOwn: false,
      status: 'needs_reply',
      assigneeId: null,
      platformCreatedAt: new Date('2026-07-01T12:00:00Z'),
      post: {
        id: 'post-1',
        content: '<p>Hello world</p>',
        publishDate: new Date('2026-07-01T10:00:00Z'),
        integration: {
          name: 'X Account',
          providerIdentifier: 'x',
          picture: 'https://example.com/x.png',
        },
      },
      ...overrides,
    };
  }

  it('returns a trimmed inbox with nextCursor', async () => {
    const comment = makeComment();
    const socialCommentsService = {
      getInbox: vi.fn().mockResolvedValue({
        comments: [comment],
        nextCursor: '2026-07-01T11:00:00.000Z',
      }),
    };
    const tool = new CommentsInboxTool(socialCommentsService as any);

    const result = await executeTool(tool, {
      inputData: { status: 'needs_reply', unreadOnly: true },
      organization: org,
      user,
      access: { mode: 'user' },
    });

    expect(socialCommentsService.getInbox).toHaveBeenCalledWith(org.id, user.id, {
      status: 'needs_reply',
      assigneeId: undefined,
      cursor: undefined,
      unreadOnly: true,
      campaignIds: undefined,
      integrationIds: undefined,
    });

    expect(result.comments).toHaveLength(1);
    expect(result.comments[0]).toMatchObject({
      id: 'comment-1',
      postId: 'post-1',
      integrationId: 'int-1',
      platformCommentId: 'platform-comment-1',
      authorName: 'Alice',
      content: 'Great post!',
      likeCount: 5,
      replyCount: 1,
      isOwn: false,
      status: 'needs_reply',
      platformCreatedAt: '2026-07-01T12:00:00.000Z',
      post: {
        id: 'post-1',
        content: '<p>Hello world</p>',
        publishDate: '2026-07-01T10:00:00.000Z',
        integration: {
          name: 'X Account',
          providerIdentifier: 'x',
          picture: 'https://example.com/x.png',
        },
      },
    });
    expect(result.nextCursor).toBe('2026-07-01T11:00:00.000Z');
  });

  it('trims long comment and post content', async () => {
    const longContent = 'a'.repeat(3000);
    const longPostContent = 'b'.repeat(800);
    const socialCommentsService = {
      getInbox: vi.fn().mockResolvedValue({
        comments: [
          makeComment({
            content: longContent,
            post: {
              id: 'post-1',
              content: longPostContent,
              publishDate: new Date('2026-07-01T10:00:00Z'),
              integration: {
                name: 'X Account',
                providerIdentifier: 'x',
                picture: null,
              },
            },
          }),
        ],
        nextCursor: undefined,
      }),
    };
    const tool = new CommentsInboxTool(socialCommentsService as any);

    const result = await executeTool(tool, {
      inputData: {},
      organization: org,
      user,
      access: { mode: 'user' },
    });

    expect(result.comments[0].content).toHaveLength(2001);
    expect(result.comments[0].content.endsWith('…')).toBe(true);
    expect(result.comments[0].post.content).toHaveLength(501);
    expect(result.comments[0].post.content.endsWith('…')).toBe(true);
  });

  it('returns an empty inbox when there are no comments', async () => {
    const socialCommentsService = {
      getInbox: vi.fn().mockResolvedValue({ comments: [], nextCursor: undefined }),
    };
    const tool = new CommentsInboxTool(socialCommentsService as any);

    const result = await executeTool(tool, {
      inputData: {},
      organization: org,
      user,
      access: { mode: 'user' },
    });

    expect(result.comments).toEqual([]);
    expect(result.nextCursor).toBeUndefined();
  });

  it('denies read without access context', async () => {
    const socialCommentsService = {
      getInbox: vi.fn().mockResolvedValue({ comments: [], nextCursor: undefined }),
    };
    const tool = new CommentsInboxTool(socialCommentsService as any);

    await expect(
      executeTool(tool, {
        inputData: {},
        organization: org,
        user,
      })
    ).rejects.toThrow('Read access denied: no access context');
  });

  it('denies read for MCP callers without mcp:read scope', async () => {
    const socialCommentsService = {
      getInbox: vi.fn().mockResolvedValue({ comments: [], nextCursor: undefined }),
    };
    const tool = new CommentsInboxTool(socialCommentsService as any);

    await expect(
      executeTool(tool, {
        inputData: {},
        organization: org,
        user,
        access: { mode: 'mcp', scopes: [] },
      })
    ).rejects.toThrow('Read access denied: mcp:read scope required');
  });
});
