import {
  Controller,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { User, Organization } from '@prisma/client';
import { NotificationService } from '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service';
import { OrganizationRepository } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.repository';
import { RequirePermission } from '@gitroom/backend/services/auth/rbac/require-permission.decorator';
import { OrgRbacGuard } from '@gitroom/backend/services/auth/rbac/org-rbac.guard';
import { BroadcastNotificationDto } from '@gitroom/nestjs-libraries/dtos/notifications/notification-preference.dto';

@ApiTags('Admin Notifications')
@Controller('/admin/notifications')
@UseGuards(OrgRbacGuard)
export class AdminNotificationsController {
  constructor(
    private _notificationService: NotificationService,
    private _organizationRepository: OrganizationRepository
  ) {}

  @Post('/broadcast')
  @RequirePermission('notifications', 'manage')
  async broadcast(
    @GetUserFromRequest() user: User,
    @GetOrgFromRequest() organization: Organization,
    @Body() body: BroadcastNotificationDto
  ) {
    const team = await this._organizationRepository.getTeam(organization.id);
    const members = team?.users ?? [];

    let targetUserIds = new Set(members.map((m) => m.user.id));

    if (body.targetUserIds && body.targetUserIds.length > 0) {
      targetUserIds = new Set(
        members
          .map((m) => m.user.id)
          .filter((id) => body.targetUserIds!.includes(id))
      );
    }

    if (body.targetRoles && body.targetRoles.length > 0) {
      const roleKeys = new Set(body.targetRoles);
      targetUserIds = new Set(
        members
          .filter((m) => m.roleRef && roleKeys.has(m.roleRef.key))
          .map((m) => m.user.id)
      );
    }

    await this._notificationService.notify({
      orgId: organization.id,
      category: 'announcements',
      title: body.title,
      message: body.message,
      channels: body.channels ?? { email: true, push: false, inApp: true },
      override: true,
      targetUserIds: Array.from(targetUserIds),
    });

    return { success: true, sentTo: targetUserIds.size };
  }
}
