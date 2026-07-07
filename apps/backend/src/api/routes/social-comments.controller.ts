import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query, UnprocessableEntityException } from '@nestjs/common';
import { ParseCuidPipe, isCuid } from '@gitroom/nestjs-libraries/pipes/parse-cuid.pipe';
import { SocialCommentsService, VALID_COMMENT_STATUSES } from '@gitroom/nestjs-libraries/database/prisma/social-comments/social.comments.service';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import {
  LikeCommentDto,
  ReplyCommentDto,
} from '@gitroom/nestjs-libraries/dtos/social-comments/social.comment.dto';
import { GetInboxDto } from '@gitroom/nestjs-libraries/dtos/social-comments/get-inbox.dto';
import { BulkMarkReadDto } from '@gitroom/nestjs-libraries/dtos/social-comments/bulk-mark-read.dto';
import { UpdateCommentStatusDto } from '@gitroom/nestjs-libraries/dtos/social-comments/update-comment-status.dto';
import { AssignCommentDto } from '@gitroom/nestjs-libraries/dtos/social-comments/assign-comment.dto';
import { Organization, User } from '@prisma/client';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import { AuthorizationActions, Sections } from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { isISO8601, isUUID } from 'class-validator';
import { RequirePermission } from '@gitroom/backend/services/auth/rbac/require-permission.decorator';
import { GuardrailService } from '@gitroom/nestjs-libraries/ai/governance/guardrail.service';
import { GuardrailViolation } from '@gitroom/nestjs-libraries/ai/governance/errors';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';

@Controller('/posts')
export class SocialCommentsController {
  constructor(
    private _socialCommentsService: SocialCommentsService,
    private _guardrails: GuardrailService,
  ) {}

  // The org's output guardrail is ALWAYS enforced on outward replies — enforcement
  // decided by the caller is not enforcement (a cookie/API client omitting the old
  // `guardrail` flag would otherwise skip it). It is a no-op for orgs with no output
  // chain. A block-mode chain throws GuardrailViolation → mapped to 422 so the HITL
  // card can show the reason instead of a raw 500 (3.1).
  private async _guardOutbound(
    message: string,
    org: Organization,
    user: User,
  ): Promise<string> {
    try {
      return await this._guardrails.checkOutput(message, { orgId: org.id, userId: user.id });
    } catch (e) {
      if (e instanceof GuardrailViolation) {
        throw new UnprocessableEntityException(e.message);
      }
      throw e;
    }
  }

  // Optional idempotency for the two outward-dispatching reply routes. A client
  // (the agent HITL card, or any retry after an ambiguous timeout) sends the same
  // X-Idempotency-Key so a retry cannot double-dispatch an outward comment.
  //
  // Contract (see _withIdempotency): the key is claimed with SET NX right before
  // dispatch and RELEASED if the dispatch throws — so a definite failure (provider
  // error) is retryable, while a *successful* dispatch keeps the key so an ambiguous
  // client-timeout-after-success still dedups. Guardrail validation runs BEFORE the
  // claim (in the route handler), so a blocked message never burns a slot. Best-
  // effort throughout: a Redis outage fails OPEN (proceeds without dedup), matching
  // the shared IdempotencyFactory. Absent key → always proceed (unchanged). (3.2)
  private async _withIdempotency<T>(
    orgId: string,
    key: string | undefined,
    dispatch: () => Promise<T>,
  ): Promise<T | { duplicate: true }> {
    if (!(await this._claimIdempotencyKey(orgId, key))) {
      return { duplicate: true };
    }
    try {
      return await dispatch();
    } catch (e) {
      // Dispatch failed → release the claim so a legitimate same-key retry can
      // re-attempt instead of getting a false "duplicate" success. (Residual: a DB
      // write failing right after a successful outward post could let one retry
      // re-post — inherent to receipt-time dedup; the shared response-replay
      // IdempotencyFactory is the fuller fix if this ever matters.)
      await this._releaseIdempotencyKey(orgId, key);
      throw e;
    }
  }

  private async _claimIdempotencyKey(
    orgId: string,
    key: string | undefined,
  ): Promise<boolean> {
    if (!key) return true;
    try {
      const res = await ioRedis.set(`idem:${orgId}:${key}`, '1', 'EX', 86400, 'NX');
      return res === 'OK';
    } catch (e) {
      // Redis outage → fail open (proceed without dedup), never fail the reply.
      return true;
    }
  }

  private async _releaseIdempotencyKey(orgId: string, key: string | undefined) {
    if (!key) return;
    try {
      await ioRedis.del(`idem:${orgId}:${key}`);
    } catch {
      // best-effort — a stale key just expires at the 24h TTL
    }
  }

  @Get('/inbox')
  @CheckPolicies([AuthorizationActions.Read, Sections.COMMUNITY_FEATURES])
  async getInbox(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Query() query: GetInboxDto,
  ) {
    if (query.status && !(VALID_COMMENT_STATUSES as readonly string[]).includes(query.status)) {
      throw new BadRequestException(`Invalid status: ${query.status}. Must be one of: ${VALID_COMMENT_STATUSES.join(', ')}`);
    }
    if (query.assigneeId && !isCuid(query.assigneeId)) {
      throw new BadRequestException('Invalid assigneeId');
    }
    // integrationId/campaignId accept a single id or a comma-separated list (multi-select
    // filter). A lone value stays byte-for-byte compatible (splits to a 1-element array).
    const campaignIds = query.campaignId ? query.campaignId.split(',').map((s) => s.trim()).filter(Boolean) : [];
    for (const id of campaignIds) {
      if (!isUUID(id)) throw new BadRequestException('Invalid campaignId');
    }
    const integrationIds = query.integrationId ? query.integrationId.split(',').map((s) => s.trim()).filter(Boolean) : [];
    for (const id of integrationIds) {
      if (!isCuid(id)) throw new BadRequestException('Invalid integrationId');
    }
    return this._socialCommentsService.getInbox(org.id, user.id, {
      status: query.status,
      assigneeId: query.assigneeId,
      cursor: query.cursor,
      unreadOnly: query.unreadOnly,
      campaignIds,
      integrationIds,
      limit: query.limit,
    });
  }

  @Post('/inbox/bulk-read')
  @RequirePermission('comments', 'update')
  @CheckPolicies([AuthorizationActions.Create, Sections.COMMUNITY_FEATURES])
  async bulkMarkRead(
    @GetOrgFromRequest() org: Organization,
    @Body() body: BulkMarkReadDto,
  ) {
    return this._socialCommentsService.bulkMarkRead(body.commentIds, org.id);
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
    @Headers('x-idempotency-key') idempotencyKey: string | undefined,
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
  ) {
    // Guard first (deterministic, side-effect-free) so a blocked message never
    // burns an idempotency slot, then dispatch under the idempotency wrapper.
    const message = await this._guardOutbound(body.message, org, user);
    return this._withIdempotency(org.id, idempotencyKey, () =>
      this._socialCommentsService.replyToPost(org.id, user.id, id, message),
    );
  }

  @Post('/:id/social-comments/:commentId/reply')
  @RequirePermission('comments', 'create')
  @CheckPolicies([AuthorizationActions.Create, Sections.COMMUNITY_FEATURES])
  async replyToComment(
    @Param('id', ParseCuidPipe) id: string,
    @Param('commentId', ParseCuidPipe) commentId: string,
    @Body() body: ReplyCommentDto,
    @Headers('x-idempotency-key') idempotencyKey: string | undefined,
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
  ) {
    const message = await this._guardOutbound(body.message, org, user);
    return this._withIdempotency(org.id, idempotencyKey, () =>
      this._socialCommentsService.replyToComment(org.id, user.id, id, commentId, message),
    );
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
    @Body() body: UpdateCommentStatusDto,
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
  ) {
    return this._socialCommentsService.updateCommentStatus(org.id, user.id, id, commentId, body.status);
  }

  @Post('/:id/social-comments/:commentId/assign')
  @RequirePermission('comments', 'update')
  @CheckPolicies([AuthorizationActions.Create, Sections.COMMUNITY_FEATURES])
  async assignComment(
    @Param('id', ParseCuidPipe) id: string,
    @Param('commentId', ParseCuidPipe) commentId: string,
    @Body() body: AssignCommentDto,
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
  ) {
    return this._socialCommentsService.assignComment(org.id, user.id, id, commentId, body.assigneeId ?? null);
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
