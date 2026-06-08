import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { Organization } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { ApiTags } from '@nestjs/swagger';
import { CampaignsService } from '@gitroom/nestjs-libraries/database/prisma/campaigns/campaigns.service';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import {
  AuthorizationActions,
  Sections,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { IsString, IsOptional, IsBoolean, IsDateString } from 'class-validator';

class CreateCampaignDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

class UpdateCampaignDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}

@ApiTags('Campaigns')
@Controller('/campaigns')
export class CampaignsController {
  constructor(private _campaignsService: CampaignsService) {}

  @Get('/')
  @CheckPolicies([AuthorizationActions.Read, Sections.POSTS_PER_MONTH])
  async list(@GetOrgFromRequest() org: Organization) {
    return this._campaignsService.list(org.id);
  }

  @Get('/:id')
  @CheckPolicies([AuthorizationActions.Read, Sections.POSTS_PER_MONTH])
  async get(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
  ) {
    return this._campaignsService.get(id, org.id);
  }

  @Post('/')
  @CheckPolicies([AuthorizationActions.Create, Sections.POSTS_PER_MONTH])
  async create(
    @GetOrgFromRequest() org: Organization,
    @Body() body: CreateCampaignDto,
  ) {
    if (body.startDate && body.endDate && new Date(body.endDate) <= new Date(body.startDate)) {
      throw new BadRequestException('endDate must be after startDate');
    }
    return this._campaignsService.create({
      organizationId: org.id,
      name: body.name,
      color: body.color,
      description: body.description,
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      endDate: body.endDate ? new Date(body.endDate) : undefined,
    });
  }

  @Put('/:id')
  @CheckPolicies([AuthorizationActions.Update, Sections.POSTS_PER_MONTH])
  async update(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: UpdateCampaignDto,
  ) {
    if (body.startDate && body.endDate && new Date(body.endDate) <= new Date(body.startDate)) {
      throw new BadRequestException('endDate must be after startDate');
    }
    return this._campaignsService.update(id, org.id, {
      name: body.name,
      color: body.color,
      description: body.description,
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      endDate: body.endDate ? new Date(body.endDate) : undefined,
      archived: body.archived,
    });
  }

  @Delete('/:id')
  @CheckPolicies([AuthorizationActions.Delete, Sections.POSTS_PER_MONTH])
  async delete(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
  ) {
    await this._campaignsService.remove(id, org.id);
    return { success: true };
  }
}
