import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '.prisma/client';
import { randomBytes } from 'crypto';
import { env } from '../../env/env';
import { percentToBasisPoints, rupeesToPaise } from '../../products/money';
import { mulPaiseByRateBp } from '../../sales/sales.math';
import { PrismaService } from '../../prisma/prisma.service';
import { ErpService } from '../../erp/erp.service';
import type { CreatePosStitchingOrderDto } from './stitching-pos.dtos';

function randomOrderCode() {
  const n = Math.floor(1000 + Math.random() * 99000);
  return String(n);
}

@Injectable()
export class StitchingPosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly erp: ErpService
  ) {}

  async listTemplates(orgId: string) {
    const templates = await this.prisma.stitchingProductTemplate.findMany({
      where: { orgId },
      orderBy: { updatedAt: 'desc' },
      include: { measurementProfiles: true, colors: true, materialConfigs: true, categoryRef: true } as any
    });
    return { templates };
  }

  async listActiveTailors(orgId: string) {
    const tailors = await this.prisma.stitchingTailor.findMany({
      where: { orgId, isActive: true },
      orderBy: { name: 'asc' }
    });
    return { tailors };
  }

  async createOrder(
    user: { sub: string; orgId: string; storeId?: string },
    dto: CreatePosStitchingOrderDto
  ) {
    if (!user.storeId) throw new ForbiddenException('User is not assigned to a store');

    const template = await this.prisma.stitchingProductTemplate.findFirst({
      where: { id: dto.productTemplateId, orgId: user.orgId },
      include: { measurementProfiles: true, colors: true, materialConfigs: true }
    });
    if (!template) throw new ForbiddenException('Invalid template');

    const materialSource = (dto.materialSource ?? 'STORE') as 'STORE' | 'CUSTOMER';
    const selectedColor = ((template as any).colors as any[]).find((c: any) => c.colorCode === dto.selectedColorCode) || null;
    if (materialSource === 'STORE' && !selectedColor) throw new BadRequestException('Invalid color');
    const selectedColorImageUrl =
      materialSource === 'STORE'
        ? (selectedColor?.imageUrl ?? null)
        : (dto.selectedColorImageUrl && dto.selectedColorImageUrl.trim() ? dto.selectedColorImageUrl.trim() : null);

    const sizeName = dto.sizeName?.trim() ? dto.sizeName.trim() : undefined;
    const sizeProfile = sizeName ? template.measurementProfiles.find((p: any) => p.measurementName === sizeName) : null;
    if (template.measurementProfiles.length > 0 && !sizeProfile) {
      throw new BadRequestException('Invalid sizeName');
    }

    const measurements = dto.measurements ?? {};
    if (sizeProfile) {
      const allowed = new Set<string>(sizeProfile.fields as any as string[]);
      for (const k of Object.keys(measurements)) {
        if (!allowed.has(k)) throw new BadRequestException(`Unknown measurement field: ${k}`);
        const v = (measurements as any)[k];
        if (!Number.isFinite(v) || v <= 0) throw new BadRequestException(`Invalid measurement value: ${k}`);
      }
    }

    let erpMaterialId: string | null = null;
    let materialUsageMeters: Prisma.Decimal | null = null;
    if (materialSource === 'STORE' && dto.erpMaterialId) {
      const cfg = template.materialConfigs.find((m: any) => m.erpMaterialId === dto.erpMaterialId);
      if (!cfg) throw new BadRequestException('Invalid erpMaterialId for this template');
      erpMaterialId = dto.erpMaterialId;
      const meters =
        dto.materialUsageMeters !== undefined
          ? new Prisma.Decimal(dto.materialUsageMeters)
          : (cfg.metersRequired as any as Prisma.Decimal);
      if (!meters.isFinite() || meters.lte(0)) throw new BadRequestException('Invalid materialUsageMeters');
      materialUsageMeters = meters;
      await this.erp.assertMaterialAvailability(user.orgId, {
        erpMaterialId,
        metersNeeded: Number(meters.toString()),
        storeId: user.storeId
      });
    }

    const deliveryDate = new Date(dto.deliveryDate);
    if (Number.isNaN(deliveryDate.getTime())) throw new BadRequestException('Invalid deliveryDate');

    const stitchingService = await this.resolveStitchingServiceProduct(user.orgId);
    const gstRateBp = stitchingService.gstRateBp;

    const pricePaise = rupeesToPaise(dto.priceRupees);
    const gstAmountPaise = mulPaiseByRateBp(pricePaise, gstRateBp);

    const gstOnTailor = dto.gstOnTailor ?? false;
    const tailorGstRatePercent = dto.tailorGstRatePercent ?? 0;
    if (gstOnTailor && (!Number.isFinite(tailorGstRatePercent) || tailorGstRatePercent <= 0 || tailorGstRatePercent > 100)) {
      throw new BadRequestException('Invalid tailorGstRatePercent');
    }
    const tailorGstRateBp = gstOnTailor ? percentToBasisPoints(tailorGstRatePercent) : 0;

    let customerProfileId: string | null = null;
    if (dto.erpCustomerId) {
      const erpCustomer = await this.prisma.customer.findFirst({
        where: { id: dto.erpCustomerId, orgId: user.orgId },
        select: { id: true } as any
      });
      if (!erpCustomer) throw new ForbiddenException('Invalid customer');
      const profile = await this.prisma.stitchingCustomerProfile.upsert({
        where: { orgId_erpCustomerId: { orgId: user.orgId, erpCustomerId: dto.erpCustomerId } },
        create: { orgId: user.orgId, erpCustomerId: dto.erpCustomerId },
        update: {},
        select: { id: true }
      });
      customerProfileId = profile.id;
    }

    const order = await this.createWithUniqueCode(user.orgId, {
      storeId: user.storeId,
      customerProfileId,
      productTemplateId: template.id,
      materialSource: materialSource as any,
      selectedColorName:
        (selectedColor?.colorName && String(selectedColor.colorName).trim()) ? String(selectedColor.colorName).trim()
        : (dto.selectedColorName && dto.selectedColorName.trim() ? dto.selectedColorName.trim() : 'Custom'),
      selectedColorCode: dto.selectedColorCode,
      selectedColorImageUrl,
      measurementProfileName: sizeProfile ? sizeProfile.measurementName : null,
      measurements,
      erpMaterialId,
      materialUsageMeters,
      tailorId: dto.tailorId ?? null,
      deliveryDate,
      pricePaise,
      gstRateBp,
      gstAmountPaise,
      tailorCostPaise: dto.tailorCostRupees !== undefined ? rupeesToPaise(dto.tailorCostRupees) : 0n,
      gstOnTailor,
      tailorGstRateBp,
      tailorExpenseJournalEntryId: null,
      tailorExpensePostedAt: null
    });

    const tailor = dto.tailorId
      ? await this.prisma.stitchingTailor.findFirst({ where: { id: dto.tailorId, orgId: user.orgId }, select: { id: true, name: true, phone: true } })
      : null;

    return {
      order: {
        id: order.id,
        orderCode: order.orderCode,
        gstRateBp,
        pricePaise: order.pricePaise,
        gstAmountPaise: order.gstAmountPaise,
        tailor
      },
      stitchingServiceProduct: { id: stitchingService.id, code: stitchingService.code, gstRateBp: stitchingService.gstRateBp }
    };
  }

  async createTailorSlipShareLink(orgId: string, orderId: string) {
    const order = await this.prisma.stitchingOrder.findFirst({
      where: { id: orderId, orgId },
      select: { id: true, tailorId: true }
    });
    if (!order) throw new ForbiddenException('Invalid order');
    if (!order.tailorId) throw new BadRequestException('Order has no tailor assigned');

    const token = randomBytes(24).toString('hex');
    const link = await this.prisma.stitchingTailorSlipShareLink.create({
      data: { orgId, orderId, token, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
      select: { token: true }
    });
    return link;
  }

  private async resolveStitchingServiceProduct(orgId: string) {
    const code = env.STITCHING_SERVICE_PRODUCT_CODE?.trim() ? env.STITCHING_SERVICE_PRODUCT_CODE.trim() : 'STITCH-SVC';
    const product = await this.prisma.product.findFirst({
      where: { orgId, code, isActive: true },
      select: { id: true, code: true, gstRateBp: true } as any
    });
    if (!product) throw new BadRequestException(`Missing ERP Stitching Service product. Create ERP product with code "${code}"`);
    return product as any as { id: string; code: string; gstRateBp: number };
  }

  private async createWithUniqueCode(
    orgId: string,
    data: Omit<
      Prisma.StitchingOrderUncheckedCreateInput,
      'id' | 'orgId' | 'orderCode' | 'createdAt' | 'updatedAt'
    > & {
      materialSource?: 'STORE' | 'CUSTOMER';
      selectedColorName?: string | null;
    }
  ) {
    for (let i = 0; i < 25; i += 1) {
      const code = randomOrderCode();
      try {
        return await this.prisma.stitchingOrder.create({
          data: { orgId, orderCode: code, ...(data as any) }
        });
      } catch (err: any) {
        if (err?.code === 'P2002') continue;
        throw err;
      }
    }
    throw new BadRequestException('Failed to generate unique order code');
  }
}
