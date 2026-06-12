import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class BrandsRepository {
  constructor(
    private _aiBrandProfile: PrismaRepository<'aIBrandProfile'>,
  ) {}

  getBrands(organizationId: string) {
    return this._aiBrandProfile.model.aIBrandProfile.findMany({
      where: { organizationId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
  }

  getBrand(organizationId: string, brandId: string) {
    return this._aiBrandProfile.model.aIBrandProfile.findFirst({
      where: { id: brandId, organizationId },
    });
  }

  getDefaultBrand(organizationId: string) {
    return this._aiBrandProfile.model.aIBrandProfile.findFirst({
      where: { organizationId, isDefault: true },
    });
  }

  getFirstBrand(organizationId: string) {
    return this._aiBrandProfile.model.aIBrandProfile.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
    });
  }

  countBrands(organizationId: string) {
    return this._aiBrandProfile.model.aIBrandProfile.count({
      where: { organizationId },
    });
  }

  createBrand(
    organizationId: string,
    data: {
      name: string;
      instructions?: string;
      language?: string;
      platformInstructions?: Record<string, string>;
      enabled?: boolean;
      isDefault?: boolean;
      slug?: string;
    },
  ) {
    return this._aiBrandProfile.model.aIBrandProfile.create({
      data: {
        organizationId,
        name: data.name,
        instructions: data.instructions,
        language: data.language,
        platformInstructions: data.platformInstructions || {},
        enabled: data.enabled ?? true,
        isDefault: data.isDefault ?? false,
        slug: data.slug,
      },
    });
  }

  async updateBrand(
    organizationId: string,
    brandId: string,
    data: {
      name?: string;
      instructions?: string;
      language?: string;
      platformInstructions?: Record<string, string>;
      enabled?: boolean;
    },
  ) {
    const brand = await this._aiBrandProfile.model.aIBrandProfile.findFirst({
      where: { id: brandId, organizationId },
    });
    if (!brand) return null;
    return this._aiBrandProfile.model.aIBrandProfile.update({
      where: { id: brandId },
      data,
    });
  }

  async deleteBrand(organizationId: string, brandId: string) {
    const brand = await this._aiBrandProfile.model.aIBrandProfile.findFirst({
      where: { id: brandId, organizationId },
    });
    if (!brand) return null;
    return this._aiBrandProfile.model.aIBrandProfile.delete({
      where: { id: brandId },
    });
  }

  async unsetDefaultBrand(organizationId: string) {
    await this._aiBrandProfile.model.aIBrandProfile.updateMany({
      where: { organizationId, isDefault: true },
      data: { isDefault: false },
    });
  }

  async setBrandAsDefault(organizationId: string, brandId: string) {
    await this._aiBrandProfile.model.aIBrandProfile.updateMany({
      where: { organizationId, isDefault: true },
      data: { isDefault: false },
    });
    return this._aiBrandProfile.model.aIBrandProfile.update({
      where: { id: brandId },
      data: { isDefault: true },
    });
  }
}
