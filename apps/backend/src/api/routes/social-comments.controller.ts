import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { SocialCommentsService } from '@gitroom/nestjs-libraries/database/prisma/social-comments/social.comments.service';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import {
  LikeCommentDto,
  ReplyCommentDto,
} from '@gitroom/nestjs-libraries/dtos/social-comments/social.comment.dto';
import { Organization, User } from '@prisma/client';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import { AuthorizationActions, Sections } from '@gitroom/backend/services/auth/permissions/permission.exception.class';

@Controller('/posts')
export class SocialCommentsController {
  constructor(private _socialCommentsService: SocialCommentsService) {}

  @Get('/:id/social-comments')
  @CheckPolicies([AuthorizationActions.Read, Sections.COMMUNITY_FEATURES])
  async getComments(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('cursor') cursor: string | undefined,
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
  ) {
    return this._socialCommentsService.getComments(org.id, user.id, id, cursor);
  }

  @Post('/:id/social-comments')
  @CheckPolicies([AuthorizationActions.Create, Sections.COMMUNITY_FEATURES])
  async addComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReplyCommentDto,
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
  ) {
    return this._socialCommentsService.replyToPost(org.id, user.id, id, body.message);
  }

  @Post('/:id/social-comments/:commentId/reply')
  @CheckPolicies([AuthorizationActions.Create, Sections.COMMUNITY_FEATURES])
  async replyToComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @Body() body: ReplyCommentDto,
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
  ) {
    return this._socialCommentsService.replyToComment(org.id, user.id, id, commentId, body.message);
  }

  @Post('/:id/social-comments/:commentId/like')
  @CheckPolicies([AuthorizationActions.Create, Sections.COMMUNITY_FEATURES])
  async likeComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @Body() body: LikeCommentDto,
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
  ) {
    return this._socialCommentsService.likeComment(org.id, user.id, id, commentId, body.like);
  }

  @Post('/:id/social-comments/read')
  @CheckPolicies([AuthorizationActions.Create, Sections.COMMUNITY_FEATURES])
  async markAsRead(
    @Param('id', ParseUUIDPipe) id: string,
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
  ) {
    return this._socialCommentsService.markAsRead(org.id, user.id, id);
  }

  @Post('/:id/social-comments/:commentId/status')
  @CheckPolicies([AuthorizationActions.Create, Sections.COMMUNITY_FEATURES])
  async updateCommentStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @Body('status') status: string,
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
  ) {
    return this._socialCommentsService.updateCommentStatus(org.id, user.id, id, commentId, status);
  }

  @Post('/:id/social-comments/:commentId/assign')
  @CheckPolicies([AuthorizationActions.Create, Sections.COMMUNITY_FEATURES])
  async assignComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @Body('assigneeId') assigneeId: string | null,
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
  ) {
    return this._socialCommentsService.assignComment(org.id, user.id, id, commentId, assigneeId);
  }

  @Get('/:id/social-comments/unread-count')
  @CheckPolicies([AuthorizationActions.Read, Sections.COMMUNITY_FEATURES])
  async getUnreadCount(
    @Param('id', ParseUUIDPipe) id: string,
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
  ) {
    return this._socialCommentsService.getUnreadCount(org.id, user.id, id);
  }
}
