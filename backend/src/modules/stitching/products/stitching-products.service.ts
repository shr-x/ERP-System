import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '.prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  CreateStitchingProductTemplateDto,
  StitchingMeasurementProfileDto,
  StitchingProductColorDto,
  StitchingProductMaterialConfigDto,
  UpdateStitchingProductTemplateDto
} from './stitching-products.dtos';

@Injectable()
export class StitchingProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async listCategories(orgId: string, q?: string) {
    const query = q?.trim();
    return {
      categories: await (this.prisma as any).stitchingTemplateCategory.findMany({
        where: {
          orgId,
          ...(query ? { name: { contains: query, mode: 'insensitive' } } : {})
        } as any,
        orderBy: { name: 'asc' },
        take: query ? 50 : 500,
        select: { id: true, name: true, posVisible: true } as any
      } as any)
    };
  }

  async createCategory(orgId: string, input: { name: string; posVisible?: boolean }) {
    try {
      return {
        category: await (this.prisma as any).stitchingTemplateCategory.create({
          data: {
            orgId,
            name: input.name.trim(),
            posVisible: input.posVisible ?? true
          } as any,
          select: { id: true, name: true, posVisible: true } as any
        } as any)
      };
    } catch (e: any) {
      if (e?.code === 'P2002') throw new BadRequestException('Category name already exists');
      throw e;
    }
  }

  async deleteCategory(orgId: string, id: string) {
    const existing = await (this.prisma as any).stitchingTemplateCategory.findFirst({
      where: { id, orgId },
      select: { id: true }
    });
    if (!existing) throw new BadRequestException('Invalid category');
    const hasTemplates = await this.prisma.stitchingProductTemplate.findFirst({
      where: { orgId, categoryId: id } as any,
      select: { id: true }
    });
    if (hasTemplates) throw new BadRequestException('Category has templates and cannot be deleted');
    await (this.prisma as any).stitchingTemplateCategory.delete({ where: { id }, select: { id: true } });
    return { ok: true };
  }

  async list(orgId: string, input: { q?: string; page: number; pageSize: number }) {
    const q = input.q?.trim();
    const where: Prisma.StitchingProductTemplateWhereInput = {
      orgId,
      ...(q ? { name: { contains: q, mode: Prisma.QueryMode.insensitive } } : {})
    };

    const [total, templates] = await Promise.all([
      this.prisma.stitchingProductTemplate.count({ where }),
      this.prisma.stitchingProductTemplate.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        include: { measurementProfiles: true, colors: true, materialConfigs: true, categoryRef: true } as any
      })
    ]);

    return { total, page: input.page, pageSize: input.pageSize, templates };
  }

  async get(orgId: string, id: string) {
    const template = await this.prisma.stitchingProductTemplate.findFirst({
      where: { id, orgId },
      include: { measurementProfiles: true, colors: true, materialConfigs: true, categoryRef: true } as any
    });
    if (!template) throw new ForbiddenException('Invalid product template');
    return template;
  }

  async create(orgId: string, dto: CreateStitchingProductTemplateDto) {
    const categoryId = dto.categoryId ?? null;
    if (categoryId) {
      const exists = await (this.prisma as any).stitchingTemplateCategory.findFirst({
        where: { id: categoryId, orgId },
        select: { id: true }
      });
      if (!exists) throw new BadRequestException('Invalid categoryId');
    }
    return this.prisma.stitchingProductTemplate.create({
      data: {
        orgId,
        name: dto.name,
        category: dto.category,
        categoryId,
        measurementProfiles: dto.measurementProfiles?.length
          ? { create: dto.measurementProfiles.map((p) => this.mapMeasurementProfile(p)) }
          : undefined,
        colors: dto.colors?.length ? { create: dto.colors.map((c) => this.mapColor(c)) } : undefined,
        materialConfigs: dto.materialConfigs?.length
          ? { create: dto.materialConfigs.map((m) => this.mapMaterialConfig(m)) }
          : undefined
      } as any,
      include: { measurementProfiles: true, colors: true, materialConfigs: true, categoryRef: true } as any
    });
  }

  async update(orgId: string, id: string, dto: UpdateStitchingProductTemplateDto) {
    await this.get(orgId, id);
    const categoryId = dto.categoryId;
    if (typeof categoryId === 'string' && categoryId.trim()) {
      const exists = await (this.prisma as any).stitchingTemplateCategory.findFirst({
        where: { id: categoryId, orgId },
        select: { id: true }
      });
      if (!exists) throw new BadRequestException('Invalid categoryId');
    }
    return this.prisma.stitchingProductTemplate.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {})
      } as any,
      include: { measurementProfiles: true, colors: true, materialConfigs: true, categoryRef: true } as any
    });
  }

  async delete(orgId: string, id: string) {
    await this.get(orgId, id);
    const hasOrders = await this.prisma.stitchingOrder.findFirst({
      where: { orgId, productTemplateId: id },
      select: { id: true }
    });
    if (hasOrders) throw new ConflictException('Cannot delete template with existing orders');
    await this.prisma.stitchingProductTemplate.delete({ where: { id } });
    return { id };
  }

  async addColor(orgId: string, templateId: string, dto: StitchingProductColorDto) {
    await this.get(orgId, templateId);
    try {
      return await this.prisma.stitchingProductColor.create({
        data: { productId: templateId, colorName: dto.colorName.trim(), colorCode: dto.colorCode, imageUrl: dto.imageUrl?.trim() || null } as any
      });
    } catch (err: any) {
      if (err?.code === 'P2002') throw new ConflictException('Color already exists for this template');
      throw err;
    }
  }

  async setColorImage(
    orgId: string,
    templateId: string,
    colorId: string,
    file: { buffer: Buffer; mimetype?: string; size?: number }
  ) {
    await this.get(orgId, templateId);
    const color = await this.prisma.stitchingProductColor.findFirst({
      where: { id: colorId, productId: templateId },
      select: { id: true }
    });
    if (!color) throw new ForbiddenException('Invalid color');
    if (!file?.buffer?.length) throw new BadRequestException('file is required');
    const mimetype = (file.mimetype || '').toLowerCase();
    if (!mimetype.startsWith('image/')) throw new BadRequestException('Only image files are allowed');

    return this.prisma.stitchingProductColor.update({
      where: { id: colorId },
      data: {
        imageData: new Uint8Array(file.buffer),
        imageMime: mimetype || null,
        imageUrl: `/media/stitching/colors/${colorId}`
      }
    });
  }

  async deleteColor(orgId: string, templateId: string, colorId: string) {
    await this.get(orgId, templateId);
    const color = await this.prisma.stitchingProductColor.findFirst({
      where: { id: colorId, productId: templateId },
      select: { id: true }
    });
    if (!color) throw new ForbiddenException('Invalid color');
    await this.prisma.stitchingProductColor.delete({ where: { id: colorId } });
    return { id: colorId };
  }

  async addMeasurementProfile(orgId: string, templateId: string, dto: StitchingMeasurementProfileDto) {
    await this.get(orgId, templateId);
    try {
      return await this.prisma.stitchingProductMeasurementProfile.create({
        data: { productId: templateId, measurementName: dto.measurementName, fields: dto.fields }
      });
    } catch (err: any) {
      if (err?.code === 'P2002') throw new ConflictException('Measurement profile already exists for this template');
      throw err;
    }
  }

  async deleteMeasurementProfile(orgId: string, templateId: string, profileId: string) {
    await this.get(orgId, templateId);
    const profile = await this.prisma.stitchingProductMeasurementProfile.findFirst({
      where: { id: profileId, productId: templateId },
      select: { id: true }
    });
    if (!profile) throw new ForbiddenException('Invalid measurement profile');
    await this.prisma.stitchingProductMeasurementProfile.delete({ where: { id: profileId } });
    return { id: profileId };
  }

  async addMaterialConfig(orgId: string, templateId: string, dto: StitchingProductMaterialConfigDto) {
    await this.get(orgId, templateId);
    return this.prisma.stitchingProductMaterialConfig.create({
      data: {
        productId: templateId,
        erpMaterialId: dto.erpMaterialId,
        metersRequired: new Prisma.Decimal(dto.metersRequired)
      }
    });
  }

  async deleteMaterialConfig(orgId: string, templateId: string, configId: string) {
    await this.get(orgId, templateId);
    const config = await this.prisma.stitchingProductMaterialConfig.findFirst({
      where: { id: configId, productId: templateId },
      select: { id: true }
    });
    if (!config) throw new ForbiddenException('Invalid material config');
    await this.prisma.stitchingProductMaterialConfig.delete({ where: { id: configId } });
    return { id: configId };
  }

  private mapMeasurementProfile(p: StitchingMeasurementProfileDto) {
    return { measurementName: p.measurementName, fields: p.fields };
  }

  private mapColor(c: StitchingProductColorDto) {
    return { colorName: c.colorName.trim(), colorCode: c.colorCode, imageUrl: c.imageUrl?.trim() || null };
  }

  private mapMaterialConfig(m: StitchingProductMaterialConfigDto) {
    return { erpMaterialId: m.erpMaterialId, metersRequired: new Prisma.Decimal(m.metersRequired) };
  }
}
