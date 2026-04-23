import { Injectable, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

function isHiddenPosCategoryName(name: string) {
  const v = (name || '').trim().toLowerCase();
  return v === 'materials' || v === 'material' || v === 'services' || v === 'service';
}

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async createCategory(orgId: string, name: string, imageUrl?: string) {
    try {
      return await this.prisma.productCategory.create({
        data: { orgId, name, imageUrl },
        select: { id: true, name: true, imageUrl: true }
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new ConflictException('Category name already exists');
      }
      throw err;
    }
  }

  async listCategories(orgId: string, channel?: 'POS') {
    const categories = await this.prisma.productCategory.findMany({
      where: { orgId, ...(channel === 'POS' ? { posVisible: true } : {}) } as any,
      orderBy: { name: 'asc' },
      select: { id: true, name: true, imageUrl: true, posVisible: true } as any
    });
    if (channel !== 'POS') return categories;
    return categories.filter((c: any) => !isHiddenPosCategoryName(c?.name));
  }

  async updateCategory(orgId: string, id: string, name?: string, imageUrl?: string) {
    const existing = await this.prisma.productCategory.findFirst({
      where: { id, orgId },
      select: { id: true }
    });
    if (!existing) throw new ForbiddenException('Invalid category');

    return this.prisma.productCategory.update({
      where: { id },
      data: { name, imageUrl },
      select: { id: true, name: true, imageUrl: true }
    });
  }

  async deleteCategory(orgId: string, id: string) {
    const existing = await this.prisma.productCategory.findFirst({
      where: { id, orgId },
      select: { id: true }
    });
    if (!existing) throw new ForbiddenException('Invalid category');

    // Optional: check if category has products
    const hasProducts = await this.prisma.product.findFirst({
      where: { categoryId: id },
      select: { id: true }
    });
    if (hasProducts) throw new ConflictException('Category has products and cannot be deleted');

    return this.prisma.productCategory.delete({
      where: { id },
      select: { id: true }
    });
  }

  async setCategoryImage(orgId: string, id: string, file: { buffer: Buffer; mimetype?: string }) {
    const existing = await this.prisma.productCategory.findFirst({
      where: { id, orgId },
      select: { id: true }
    });
    if (!existing) throw new ForbiddenException('Invalid category');

    const imageData = Uint8Array.from(file.buffer);

    return this.prisma.productCategory.update({
      where: { id },
      data: { imageData, imageMime: file.mimetype || 'application/octet-stream' },
      select: { id: true, name: true, imageUrl: true }
    });
  }
}
