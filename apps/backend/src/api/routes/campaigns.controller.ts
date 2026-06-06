import {
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
  async list(@GetOrgFromRequest() org: Organization) {
    return this._campaignsService.list(org.id);
  }

  @Get('/:id')
  async get(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
  ) {
    return this._campaignsService.get(id, org.id);
  }

  @Post('/')
  async create(
    @GetOrgFromRequest() org: Organization,
    @Body() body: CreateCampaignDto,
  ) {
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
  async update(
    @Param('id') id: string,
    @Body() body: UpdateCampaignDto,
  ) {
    return this._campaignsService.update(id, {
      name: body.name,
      color: body.color,
      description: body.description,
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      endDate: body.endDate ? new Date(body.endDate) : undefined,
      archived: body.archived,
    });
  }

  @Delete('/:id')
  async delete(@Param('id') id: string) {
    await this._campaignsService.remove(id);
    return { success: true };
  }
}
