import { Controller, Get, UseGuards } from '@nestjs/common';
import { PROVIDER_CAPABILITIES } from '@gitroom/nestjs-libraries/integrations/social/provider-capabilities';
import { RequirePermission } from '@gitroom/backend/services/auth/rbac/require-permission.decorator';
import { OrgRbacGuard } from '@gitroom/backend/services/auth/rbac/org-rbac.guard';

@UseGuards(OrgRbacGuard)
@Controller('/')
export class ProviderCapabilitiesController {
  @Get('/admin/provider-capabilities')
  @RequirePermission('channels', 'manage')
  async getAdminMatrix() {
    return PROVIDER_CAPABILITIES;
  }

  @Get('/provider-capabilities')
  async getAllCapabilities() {
    return PROVIDER_CAPABILITIES;
  }
}
