import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { SocialCommentsService } from '@gitroom/nestjs-libraries/database/prisma/social-comments/social.comments.service';
import { GuardrailService } from '@gitroom/nestjs-libraries/ai/governance/guardrail.service';
import {
  parseOrg,
  parseUser,
  requireWrite,
  guardOutbound,
} from '@gitroom/nestjs-libraries/chat/tools/tool.helpers';

/**
 * Required scope for MCP callers: `mcp:posts:write`.
 * This is a write tool that posts an outward-facing reply to a synced social
 * comment (or a top-level comment on a published post). The message text is
 * passed through the configured output guardrail before it leaves the app.
 * Frontend human-in-the-loop confirmation is handled separately in Phase 5.1.
 */
@Injectable()
export class CommentReplyTool implements AgentToolInterface {
  constructor(
    private _socialCommentsService: SocialCommentsService,
    private _guardrailService: GuardrailService,
  ) {}
  name = 'commentReply';

  run() {
    return createTool({
      id: 'commentReply',
      description:
        'Reply to a synced social comment or post a first comment on a published post. Requires mcp:posts:write scope for MCP callers. The message text is guardrailed before being sent.',
      inputSchema: z.object({
        postId: z.string().describe('The post id the comment belongs to'),
        message: z.string().describe('The reply text to send'),
        commentId: z
          .string()
          .optional()
          .describe(
            'Optional comment id; if provided, the reply is threaded under that comment, otherwise it posts a top-level comment on the post'
          ),
      }),
      outputSchema: z.object({
        platformCommentId: z.string(),
        content: z.string(),
        authorName: z.string(),
        createdAt: z.string(),
      }),
      mcp: {
        annotations: {
          title: 'Reply to Social Comment',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true,
        },
      },
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const ctx = context as any;
        requireWrite(ctx);
        const org = parseOrg(ctx);
        const user = parseUser(ctx);

        const guardedMessage = await guardOutbound(
          this._guardrailService,
          inputData.message,
          { userId: user.id, orgId: org.id }
        );

        const result = inputData.commentId
          ? await this._socialCommentsService.replyToComment(
              org.id,
              user.id,
              inputData.postId,
              inputData.commentId,
              guardedMessage
            )
          : await this._socialCommentsService.replyToPost(
              org.id,
              user.id,
              inputData.postId,
              guardedMessage
            );

        const createdAt = (result as any).createdAt;
        return {
          platformCommentId: result.platformCommentId,
          content: result.content,
          authorName: result.author.name,
          createdAt: createdAt
            ? typeof createdAt === 'string'
              ? createdAt
              : createdAt.toISOString()
            : new Date().toISOString(),
        };
      },
    });
  }
}
