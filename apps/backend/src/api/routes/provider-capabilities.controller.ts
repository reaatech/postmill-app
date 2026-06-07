import { Controller, Get, HttpException } from '@nestjs/common';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { User } from '@prisma/client';
import { PROVIDER_CAPABILITIES } from '@gitroom/nestjs-libraries/integrations/social/provider-capabilities';

@Controller('/')
export class ProviderCapabilitiesController {
  @Get('/admin/provider-capabilities')
  async getAdminMatrix(@GetUserFromRequest() user: User) {
    if (!user?.isSuperAdmin) {
      throw new HttpException('Unauthorized', 400);
    }
    return PROVIDER_CAPABILITIES;
  }

  @Get('/provider-capabilities')
  async getAllCapabilities() {
    return PROVIDER_CAPABILITIES;
  }
}
