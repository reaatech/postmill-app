import { Injectable } from '@nestjs/common';
import { CampaignsRepository } from '@gitroom/nestjs-libraries/database/prisma/campaigns/campaigns.repository';

@Injectable()
export class CampaignsService {
  constructor(
    private _campaignsRepository: CampaignsRepository,
  ) {}

  list(organizationId: string) {
    return this._campaignsRepository.findByOrg(organizationId);
  }

  get(id: string, organizationId: string) {
    return this._campaignsRepository.findById(id, organizationId);
  }

  create(params: {
    organizationId: string;
    name: string;
    color?: string;
    description?: string;
    startDate?: Date;
    endDate?: Date;
  }) {
    return this._campaignsRepository.create(params);
  }

  update(id: string, organizationId: string, data: {
    name?: string;
    color?: string;
    description?: string;
    startDate?: Date;
    endDate?: Date;
    archived?: boolean;
  }) {
    return this._campaignsRepository.update(id, organizationId, data);
  }

  remove(id: string, organizationId: string) {
    return this._campaignsRepository.softDelete(id, organizationId);
  }
}
