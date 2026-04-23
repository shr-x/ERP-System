import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { percentToBasisPoints, rupeesToPaise } from './money';

function isHiddenPosCategoryName(name: string) {
  const v = (name || '').trim().toLowerCase();
  return v === 'materials' || v === 'material' || v === 'services' || v === 'service';
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async createProduct(
    orgId: string,
    input: {
      code: string;
      name: string;
      sizeLabel?: string;
      parentProductId?: string;
      hsnCode: string;
      gstRatePercent: number;
      sellingPriceRupees: number;
      costPriceRupees?: number;
      imageUrl?: string;
      categoryId?: string;
      posVisible?: boolean;
      isPortalManaged?: boolean;
    }
  ) {
    const gstRateBp = percentToBasisPoints(input.gstRatePercent);
    const sellingPricePaise = rupeesToPaise(input.sellingPriceRupees);
    const costPricePaise = rupeesToPaise(input.costPriceRupees ?? 0);

    try {
      return await this.prisma.product.create({
        data: {
          orgId,
          code: input.code,
          name: input.name,
          sizeLabel: (input.sizeLabel?.trim() || 'NO_SIZE').toUpperCase(),
          parentProductId: input.parentProductId?.trim() ? input.parentProductId.trim() : null,
          hsnCode: input.hsnCode,
          gstRateBp,
          sellingPricePaise,
          costPricePaise,
          posVisible: input.posVisible ?? true,
          isPortalManaged: input.isPortalManaged ?? false,
          imageUrl: input.imageUrl,
          categoryId: input.categoryId
        } as any,
        select: {
          id: true,
          code: true,
          name: true,
          sizeLabel: true,
          parentProductId: true,
          hsnCode: true,
          gstRateBp: true,
          sellingPricePaise: true,
          costPricePaise: true,
          posVisible: true,
          isPortalManaged: true,
          imageUrl: true,
          categoryId: true,
          isActive: true
        } as any
      } as any);
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new ConflictException('Product code already exists');
      }
      throw err;
    }
  }

  async listProducts(orgId: string, q?: string, categoryId?: string, channel?: 'POS') {
    const query = q?.trim();
    const products = await this.prisma.product.findMany({
      where: {
        orgId,
        isActive: true,
        ...(channel === 'POS' ? { posVisible: true } : {}),
        ...(categoryId ? { categoryId } : {}),
        ...(query
          ? {
              OR: [
                { code: { contains: query, mode: 'insensitive' } },
                { name: { contains: query, mode: 'insensitive' } }
              ]
            }
          : {})
      },
      orderBy: { name: 'asc' },
      take: query ? 50 : 1000,
      select: {
        id: true,
        code: true,
        name: true,
        sizeLabel: true,
        parentProductId: true,
        hsnCode: true,
        gstRateBp: true,
        sellingPricePaise: true,
        posVisible: true,
        isPortalManaged: true,
        imageUrl: true,
        categoryId: true,
        category: {
          select: {
            name: true,
            posVisible: true
          }
        }
      } as any
    } as any);
    if (channel !== 'POS') return products;
    return products.filter((p: any) => {
      const catName = p?.category?.name || '';
      if (isHiddenPosCategoryName(catName)) return false;
      if (p?.category && p.category.posVisible === false) return false;
      if (p?.posVisible === false) return false;
      return true;
    });
  }

  async getProduct(orgId: string, id: string) {
    return this.prisma.product.findFirst({
      where: { orgId, id },
      select: {
        id: true,
        code: true,
        name: true,
        sizeLabel: true,
        parentProductId: true,
        hsnCode: true,
        gstRateBp: true,
        sellingPricePaise: true,
        costPricePaise: true,
        posVisible: true,
        isPortalManaged: true,
        imageUrl: true,
        categoryId: true,
        isActive: true
      } as any
    } as any);
  }

  async updateProduct(
    orgId: string,
    id: string,
    input: {
      name?: string;
      sizeLabel?: string;
      parentProductId?: string;
      hsnCode?: string;
      gstRatePercent?: number;
      sellingPriceRupees?: number;
      costPriceRupees?: number;
      imageUrl?: string;
      categoryId?: string;
      posVisible?: boolean;
      isPortalManaged?: boolean;
    }
  ) {
    const existing = await this.prisma.product.findFirst({
      where: { orgId, id },
      select: { id: true }
    });
    if (!existing) throw new ForbiddenException('Invalid product');

    const data: any = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.sizeLabel !== undefined) data.sizeLabel = (input.sizeLabel.trim() || 'NO_SIZE').toUpperCase();
    if (input.parentProductId !== undefined) data.parentProductId = input.parentProductId.trim() !== '' ? input.parentProductId.trim() : null;
    if (input.hsnCode !== undefined) data.hsnCode = input.hsnCode;
    if (input.gstRatePercent !== undefined) data.gstRateBp = input.gstRatePercent * 100;
    if (input.sellingPriceRupees !== undefined) data.sellingPricePaise = rupeesToPaise(input.sellingPriceRupees);
    if (input.costPriceRupees !== undefined) data.costPricePaise = rupeesToPaise(input.costPriceRupees);
    if (input.imageUrl !== undefined) data.imageUrl = input.imageUrl.trim() !== '' ? input.imageUrl : null;
    if (input.categoryId !== undefined) data.categoryId = input.categoryId.trim() !== '' ? input.categoryId : null;
    if (input.posVisible !== undefined) data.posVisible = input.posVisible;
    if (input.isPortalManaged !== undefined) data.isPortalManaged = input.isPortalManaged;

    return this.prisma.product.update({
      where: { id },
      data: data as any,
      select: {
        id: true,
        code: true,
        name: true,
        sizeLabel: true,
        parentProductId: true,
        hsnCode: true,
        gstRateBp: true,
        sellingPricePaise: true,
        costPricePaise: true,
        posVisible: true,
        isPortalManaged: true,
        imageUrl: true,
        categoryId: true,
        isActive: true
      } as any
    } as any);
  }

  async deleteProduct(orgId: string, id: string) {
    const existing = await this.prisma.product.findFirst({
      where: { orgId, id },
      select: { id: true }
    });
    if (!existing) throw new ForbiddenException('Invalid product');

    return this.prisma.product.update({
      where: { id },
      data: { isActive: false },
      select: { id: true, isActive: true } as any
    } as any);
  }

  async createStarterCatalog(orgId: string) {
    const categories = [
      { name: 'Sarees', imageUrl: 'https://placehold.co/400x400/png?text=Sarees' },
      { name: 'Kurtas', imageUrl: 'https://placehold.co/400x400/png?text=Kurtas' },
      { name: 'Indo-western', imageUrl: 'https://placehold.co/400x400/png?text=Indo-western' },
      { name: 'Blouse', imageUrl: 'https://placehold.co/400x400/png?text=Blouse' },
      { name: 'Pants', imageUrl: 'https://placehold.co/400x400/png?text=Pants' }
    ];

    const categoryMap = new Map<string, string>();
    for (const c of categories) {
      const cat = await this.prisma.productCategory.upsert({
        where: { orgId_name: { orgId, name: c.name } },
        update: { imageUrl: c.imageUrl },
        create: { orgId, name: c.name, imageUrl: c.imageUrl }
      });
      categoryMap.set(c.name, cat.id);
    }

    const samples: Array<{
      code: string;
      name: string;
      hsnCode: string;
      gstRateBp: number;
      sellingPricePaise: bigint;
      costPricePaise: bigint;
      imageUrl: string;
      categoryName: string;
    }> = [
      {
        code: 'SAR-0001',
        name: 'Silk Kanjeevaram Saree',
        hsnCode: '5007',
        gstRateBp: 500,
        sellingPricePaise: 850000n,
        costPricePaise: 450000n,
        imageUrl: 'https://placehold.co/600x600/png?text=Silk+Saree',
        categoryName: 'Sarees'
      },
      {
        code: 'SAR-0002',
        name: 'Cotton Banarasi Saree',
        hsnCode: '5208',
        gstRateBp: 500,
        sellingPricePaise: 350000n,
        costPricePaise: 180000n,
        imageUrl: 'https://placehold.co/600x600/png?text=Cotton+Saree',
        categoryName: 'Sarees'
      },
      {
        code: 'KUR-0001',
        name: 'Anarkali Kurta',
        hsnCode: '6204',
        gstRateBp: 1200,
        sellingPricePaise: 250000n,
        costPricePaise: 120000n,
        imageUrl: 'https://placehold.co/600x600/png?text=Anarkali',
        categoryName: 'Kurtas'
      },
      {
        code: 'KUR-0002',
        name: 'Straight Cut Kurta',
        hsnCode: '6204',
        gstRateBp: 500,
        sellingPricePaise: 150000n,
        costPricePaise: 80000n,
        imageUrl: 'https://placehold.co/600x600/png?text=Straight+Kurta',
        categoryName: 'Kurtas'
      },
      {
        code: 'IND-0001',
        name: 'Indo-western Gown',
        hsnCode: '6204',
        gstRateBp: 1200,
        sellingPricePaise: 450000n,
        costPricePaise: 220000n,
        imageUrl: 'https://placehold.co/600x600/png?text=Indo+Gown',
        categoryName: 'Indo-western'
      },
      {
        code: 'BLS-0001',
        name: 'Designer Blouse',
        hsnCode: '6206',
        gstRateBp: 500,
        sellingPricePaise: 120000n,
        costPricePaise: 60000n,
        imageUrl: 'https://placehold.co/600x600/png?text=Blouse',
        categoryName: 'Blouse'
      },
      {
        code: 'PNT-0001',
        name: 'Palazzo Pants',
        hsnCode: '6204',
        gstRateBp: 500,
        sellingPricePaise: 180000n,
        costPricePaise: 90000n,
        imageUrl: 'https://placehold.co/600x600/png?text=Palazzo',
        categoryName: 'Pants'
      }
    ];

    let created = 0;
    let updated = 0;
    for (const s of samples) {
      const categoryId = categoryMap.get(s.categoryName);
      const existing = await this.prisma.product.findFirst({
        where: { orgId, code: s.code },
        select: { id: true }
      });
      if (!existing) {
        await this.prisma.product.create({
          data: {
            orgId,
            code: s.code,
            name: s.name,
            hsnCode: s.hsnCode,
            gstRateBp: s.gstRateBp,
            sellingPricePaise: s.sellingPricePaise,
            costPricePaise: s.costPricePaise,
            imageUrl: s.imageUrl,
            categoryId
          }
        });
        created += 1;
      } else {
        await this.prisma.product.update({
          where: { id: existing.id },
          data: { 
            name: s.name, 
            hsnCode: s.hsnCode, 
            gstRateBp: s.gstRateBp, 
            imageUrl: s.imageUrl,
            categoryId
          }
        });
        updated += 1;
      }
    }
    return { created, updated, total: samples.length };
  }

  async setProductImage(orgId: string, id: string, file: { buffer: Buffer; mimetype?: string }) {
    const existing = await this.prisma.product.findFirst({
      where: { orgId, id },
      select: { id: true }
    });
    if (!existing) throw new ForbiddenException('Invalid product');

    const imageData = Uint8Array.from(file.buffer);

    return this.prisma.product.update({
      where: { id },
      data: { imageData, imageMime: file.mimetype || 'application/octet-stream' },
      select: { id: true, code: true, name: true, imageUrl: true, isActive: true } as any
    } as any);
  }
}
