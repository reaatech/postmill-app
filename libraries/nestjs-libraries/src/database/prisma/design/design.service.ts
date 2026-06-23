import { Injectable } from '@nestjs/common';
import { DesignRepository } from '@gitroom/nestjs-libraries/database/prisma/design/design.repository';

@Injectable()
export class DesignService {
  constructor(private readonly _designRepository: DesignRepository) {}

  async getDesign(orgId: string, id: string) {
    return this._designRepository.findById(orgId, id);
  }

  async listDesigns(orgId: string, page: number = 1, limit: number = 20) {
    const [designs, total] = await Promise.all([
      this._designRepository.findByOrg(orgId, page, limit),
      this._designRepository.countByOrg(orgId),
    ]);
    return { designs, total, page, limit };
  }

  async createDesign(orgId: string, userId: string, data: {
    name: string;
    doc: any;
    width: number;
    height: number;
    previewDataUrl?: string;
    campaignId?: string;
  }) {
    return this._designRepository.create({
      organizationId: orgId,
      createdById: userId,
      ...data,
    });
  }

  async updateDesign(orgId: string, id: string, data: {
    name?: string;
    doc?: any;
    width?: number;
    height?: number;
    previewDataUrl?: string;
  }) {
    return this._designRepository.update(id, orgId, data);
  }

  async deleteDesign(orgId: string, id: string) {
    return this._designRepository.softDelete(id, orgId);
  }

  async listTemplates(orgId: string) {
    return this._designRepository.findTemplatesByOrg(orgId);
  }

  async getTemplate(id: string) {
    return this._designRepository.findTemplateById(id);
  }

  async createTemplate(data: {
    organizationId?: string;
    name: string;
    category: string;
    doc: any;
    isSystem?: boolean;
  }) {
    return this._designRepository.createTemplate(data);
  }

  async deleteTemplate(orgId: string, id: string) {
    return this._designRepository.deleteTemplate(id, orgId);
  }
}
