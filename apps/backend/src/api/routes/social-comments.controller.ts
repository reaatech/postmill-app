import { BadRequestException, Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ParseCuidPipe, isCuid } from '@gitroom/nestjs-libraries/pipes/parse-cuid.pipe';
import { SocialCommentsService, VALID_COMMENT_STATUSES } from '@gitroom/nestjs-libraries/database/prisma/social-comments/social.comments.service';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import {
  LikeCommentDto,
  ReplyCommentDto,
} from '@gitroom/nestjs-libraries/dtos/social-comments/social.comment.dto';
import { Organization, User } from '@prisma/client';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import { AuthorizationActions, Sections } from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { isISO8601, isUUID } from 'class-validator';
import { RequirePermission } from '@gitroom/backend/services/auth/rbac/require-permission.decorator';
import { GuardrailService } from '@gitroom/nestjs-libraries/ai/governance/guardrail.service';

@Controller('/posts')
export class SocialCommentsController {
  constructor(
    private _socialCommentsService: SocialCommentsService,
    private _guardrails: GuardrailService,
  ) {}

  // When an agent HITL confirm card approves an AI-drafted reply it sets
  // `guardrail: true`, so the org's output guardrail runs on the (possibly
  // user-edited) text before it is dispatched — parity with the server tool's
  // own guardOutbound. No-op for human replies (flag absent) and unconfigured orgs.
  private async _maybeGuard(
    message: string,
    guardrail: boolean | undefined,
    org: Organization,
    user: User,
  ): Promise<string> {
    if (!guardrail) return message;
    return this._guardrails.checkOutput(message, { orgId: org.id, userId: user.id });
  }

  @Get('/inbox')
  @CheckPolicies([AuthorizationActions.Read, Sections.COMMUNITY_FEATURES])
  async getInbox(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Query('status') status: string | undefined,
    @Query('assigneeId') assigneeId: string | undefined,
    @Query('cursor') cursor: string | undefined,
    @Query('unreadOnly') unreadOnly: string | undefined,
    @Query('campaignId') campaignId: string | undefined,
    @Query('integrationId') integrationId: string | undefined,
  ) {
    if (status && !(VALID_COMMENT_STATUSES as readonly string[]).includes(status)) {
      throw new BadRequestException(`Invalid status: ${status}. Must be one of: ${VALID_COMMENT_STATUSES.join(', ')}`);
    }
    if (assigneeId && !isCuid(assigneeId)) {
      throw new BadRequestException('Invalid assigneeId');
    }
    // integrationId/campaignId accept a single id or a comma-separated list (multi-select
    // filter). A lone value stays byte-for-byte compatible (splits to a 1-element array).
    const campaignIds = campaignId ? campaignId.split(',').map((s) => s.trim()).filter(Boolean) : [];
    for (const id of campaignIds) {
      if (!isUUID(id)) throw new BadRequestException('Invalid campaignId');
    }
    const integrationIds = integrationId ? integrationId.split(',').map((s) => s.trim()).filter(Boolean) : [];
    for (const id of integrationIds) {
      if (!isCuid(id)) throw new BadRequestException('Invalid integrationId');
    }
    if (cursor && !isISO8601(cursor)) {
      throw new BadRequestException('Invalid cursor: must be a valid ISO 8601 date string');
    }
    return this._socialCommentsService.getInbox(org.id, user.id, {
      status,
      assigneeId,
      cursor,
      unreadOnly: unreadOnly === 'true',
      campaignIds,
      integrationIds,
    });
  }

  @Post('/inbox/bulk-read')
  @RequirePermission('comments', 'update')
  @CheckPolicies([AuthorizationActions.Create, Sections.COMMUNITY_FEATURES])
  async bulkMarkRead(
    @GetOrgFromRequest() org: Organization,
    @Body('commentIds') commentIds: string[],
  ) {
    if (!Array.isArray(commentIds) || commentIds.length > 1000) {
      throw new BadRequestException('commentIds must be an array with at most 1000 items');
    }
    return this._socialCommentsService.bulkMarkRead(commentIds, org.id);
  }

  @Get('/inbox/unread-count')
  @CheckPolicies([AuthorizationActions.Read, Sections.COMMUNITY_FEATURES])
  async getInboxUnreadCount(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
  ) {
    return this._socialCommentsService.getInboxUnreadCount(org.id, user.id);
  }

  @Post('/inbox/sync')
  @RequirePermission('comments', 'update')
  @CheckPolicies([AuthorizationActions.Create, Sections.COMMUNITY_FEATURES])
  async syncInbox(
    @GetOrgFromRequest() org: Organization,
  ) {
    return this._socialCommentsService.syncInbox(org.id);
  }

  @Get('/:id/social-comments')
  @CheckPolicies([AuthorizationActions.Read, Sections.COMMUNITY_FEATURES])
  async getComments(
    @Param('id', ParseCuidPipe) id: string,
    @Query('cursor') cursor: string | undefined,
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
  ) {
    return this._socialCommentsService.getComments(org.id, user.id, id, cursor);
  }

  @Post('/:id/social-comments')
  @RequirePermission('comments', 'create')
  @CheckPolicies([AuthorizationActions.Create, Sections.COMMUNITY_FEATURES])
  async addComment(
    @Param('id', ParseCuidPipe) id: string,
    @Body() body: ReplyCommentDto,
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
  ) {
    const message = await this._maybeGuard(body.message, body.guardrail, org, user);
    return this._socialCommentsService.replyToPost(org.id, user.id, id, message);
  }

  @Post('/:id/social-comments/:commentId/reply')
  @RequirePermission('comments', 'create')
  @CheckPolicies([AuthorizationActions.Create, Sections.COMMUNITY_FEATURES])
  async replyToComment(
    @Param('id', ParseCuidPipe) id: string,
    @Param('commentId', ParseCuidPipe) commentId: string,
    @Body() body: ReplyCommentDto,
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
  ) {
    const message = await this._maybeGuard(body.message, body.guardrail, org, user);
    return this._socialCommentsService.replyToComment(org.id, user.id, id, commentId, message);
  }

  @Post('/:id/social-comments/:commentId/like')
  @RequirePermission('comments', 'update')
  @CheckPolicies([AuthorizationActions.Create, Sections.COMMUNITY_FEATURES])
  async likeComment(
    @Param('id', ParseCuidPipe) id: string,
    @Param('commentId', ParseCuidPipe) commentId: string,
    @Body() body: LikeCommentDto,
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
  ) {
    return this._socialCommentsService.likeComment(org.id, user.id, id, commentId, body.like);
  }

  @Post('/:id/social-comments/read')
  @RequirePermission('comments', 'update')
  @CheckPolicies([AuthorizationActions.Create, Sections.COMMUNITY_FEATURES])
  async markAsRead(
    @Param('id', ParseCuidPipe) id: string,
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
  ) {
    return this._socialCommentsService.markAsRead(org.id, user.id, id);
  }

  @Post('/:id/social-comments/:commentId/status')
  @RequirePermission('comments', 'update')
  @CheckPolicies([AuthorizationActions.Create, Sections.COMMUNITY_FEATURES])
  async updateCommentStatus(
    @Param('id', ParseCuidPipe) id: string,
    @Param('commentId', ParseCuidPipe) commentId: string,
    @Body('status') status: string,
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
  ) {
    if (!(VALID_COMMENT_STATUSES as readonly string[]).includes(status)) {
      throw new BadRequestException(`Invalid status: ${status}. Must be one of: ${VALID_COMMENT_STATUSES.join(', ')}`);
    }
    return this._socialCommentsService.updateCommentStatus(org.id, user.id, id, commentId, status);
  }

  @Post('/:id/social-comments/:commentId/assign')
  @RequirePermission('comments', 'update')
  @CheckPolicies([AuthorizationActions.Create, Sections.COMMUNITY_FEATURES])
  async assignComment(
    @Param('id', ParseCuidPipe) id: string,
    @Param('commentId', ParseCuidPipe) commentId: string,
    @Body('assigneeId') assigneeId: string | null,
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
  ) {
    return this._socialCommentsService.assignComment(org.id, user.id, id, commentId, assigneeId);
  }

  @Get('/:id/social-comments/unread-count')
  @CheckPolicies([AuthorizationActions.Read, Sections.COMMUNITY_FEATURES])
  async getUnreadCount(
    @Param('id', ParseCuidPipe) id: string,
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
  ) {
    return this._socialCommentsService.getUnreadCount(org.id, user.id, id);
  }
}
