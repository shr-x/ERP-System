import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '.prisma/client';
import { htmlToPdfBuffer } from '../../gst/pdf';
import { percentToBasisPoints, rupeesToPaise } from '../../products/money';
import { mulPaiseByRateBp } from '../../sales/sales.math';
import { PrismaService } from '../../prisma/prisma.service';
import { env } from '../../env/env';
import { ErpService } from '../../erp/erp.service';
import type { AssignTailorDto, CreateStitchingOrderDto, ListOrdersQueryDto, UpdateOrderStatusDto } from './stitching-orders.dtos';
import {
  renderStitchingCustomerBillA4,
  renderStitchingCustomerBillThermal,
  renderStitchingTailorSlipA4,
  renderStitchingTailorSlipThermal
} from './stitching-orders.docs';

function randomOrderCode() {
  const n = Math.floor(1000 + Math.random() * 99000);
  return String(n);
}

@Injectable()
export class StitchingOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly erp: ErpService
  ) {}

  private async resolveOrderImageUrlForDocs(orgId: string, selectedColorImageUrl?: string | null) {
    const u = (selectedColorImageUrl || '').trim();
    if (!u) return undefined;

    const m = u.match(/^\/media\/stitching\/colors\/([0-9a-fA-F-]{36})$/);
    if (m?.[1]) {
      const row = await this.prisma.stitchingProductColor.findFirst({
        where: { id: m[1] },
        select: { imageData: true, imageMime: true, imageUrl: true }
      });
      const mime = (row?.imageMime || '').trim();
      if (row?.imageData && mime.startsWith('image/')) {
        const b64 = Buffer.from(row.imageData as any).toString('base64');
        return `data:${mime};base64,${b64}`;
      }
      if (row?.imageUrl?.trim()) return row.imageUrl.trim();
    }

    if (u.startsWith('http://') || u.startsWith('https://')) return u;
    if (u.startsWith('/')) return `http://localhost:${env.PORT}${u}`;
    return u;
  }

  async list(orgId: string, query: ListOrdersQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const q = query.q?.trim();

    let fromDate: Date | undefined;
    let toDate: Date | undefined;
    if (query.fromDate) {
      const d = new Date(`${query.fromDate}T00:00:00.000Z`);
      if (Number.isNaN(d.getTime())) throw new BadRequestException('Invalid fromDate');
      fromDate = d;
    }
    if (query.toDate) {
      const d = new Date(`${query.toDate}T23:59:59.999Z`);
      if (Number.isNaN(d.getTime())) throw new BadRequestException('Invalid toDate');
      toDate = d;
    }

    const where: Prisma.StitchingOrderWhereInput = {
      orgId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.tailorId ? { tailorId: query.tailorId } : {}),
      ...(fromDate || toDate
        ? {
            deliveryDate: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {})
            }
          }
        : {}),
      ...(q
        ? {
            OR: [
              { orderCode: { contains: q, mode: Prisma.QueryMode.insensitive } },
              { productTemplate: { name: { contains: q, mode: Prisma.QueryMode.insensitive } } },
              { tailor: { name: { contains: q, mode: Prisma.QueryMode.insensitive } } },
              { customerProfile: { erpCustomer: { fullName: { contains: q, mode: Prisma.QueryMode.insensitive } } } },
              { customerProfile: { erpCustomer: { phone: { contains: q, mode: Prisma.QueryMode.insensitive } } } }
            ]
          }
        : {})
    };

    const [total, orders] = await Promise.all([
      this.prisma.stitchingOrder.count({ where }),
      this.prisma.stitchingOrder.findMany({
        where,
        orderBy: [{ deliveryDate: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          productTemplate: { include: { colors: true, categoryRef: true } } as any,
          tailor: true,
          customerProfile: { include: { erpCustomer: true } }
        }
      })
    ]);

    return { total, page, pageSize, orders };
  }

  async get(orgId: string, id: string) {
    const order = await this.prisma.stitchingOrder.findFirst({
      where: { id, orgId },
      include: {
        productTemplate: { include: { measurementProfiles: true, colors: true, materialConfigs: true, categoryRef: true } } as any,
        tailor: true,
        customerProfile: { include: { erpCustomer: true } }
      }
    });
    if (!order) throw new ForbiddenException('Invalid order');
    const erpMaterial = order.erpMaterialId
      ? await this.prisma.product.findFirst({
          where: { id: order.erpMaterialId, orgId, isActive: true },
          select: { id: true, code: true, name: true }
        })
      : null;

    return { ...(order as any), erpMaterial };
  }

  async create(user: { sub: string; orgId: string; storeId?: string }, dto: CreateStitchingOrderDto) {
    if (!user.storeId) throw new ForbiddenException('User is not assigned to a store');

    const template = await this.prisma.stitchingProductTemplate.findFirst({
      where: { id: dto.productTemplateId, orgId: user.orgId },
      include: { measurementProfiles: true, colors: true, materialConfigs: true }
    });
    if (!template) throw new ForbiddenException('Invalid product template');

    const materialSource = (dto.materialSource ?? 'STORE') as 'STORE' | 'CUSTOMER';
    const selectedColor = template.colors.find((c: any) => c.colorCode === dto.selectedColorCode) || null;
    if (materialSource === 'STORE' && !selectedColor) throw new BadRequestException('Invalid selectedColorCode');

    const profileName = dto.measurementProfileName?.trim() ? dto.measurementProfileName.trim() : undefined;
    const profile = profileName
      ? template.measurementProfiles.find((p: any) => p.measurementName === profileName)
      : template.measurementProfiles.length === 1
        ? template.measurementProfiles[0]
        : undefined;

    if (template.measurementProfiles.length > 0 && !profile) {
      throw new BadRequestException('Invalid measurementProfileName');
    }

    if (profile) {
      const allowed = new Set<string>(profile.fields as any as string[]);
      const keys = Object.keys(dto.measurements ?? {});
      for (const k of keys) {
        if (!allowed.has(k)) throw new BadRequestException(`Unknown measurement field: ${k}`);
        const v = (dto.measurements as any)[k];
        if (!Number.isFinite(v) || v <= 0) throw new BadRequestException(`Invalid measurement value: ${k}`);
      }
    }

    let erpMaterialId: string | undefined;
    let materialUsageMeters: Prisma.Decimal | undefined;
    if (materialSource === 'STORE' && dto.erpMaterialId) {
      const cfg = template.materialConfigs.find((m: any) => m.erpMaterialId === dto.erpMaterialId);
      if (!cfg) throw new BadRequestException('Invalid erpMaterialId for this template');
      erpMaterialId = dto.erpMaterialId;
      const meters =
        dto.materialUsageMeters !== undefined ? new Prisma.Decimal(dto.materialUsageMeters) : (cfg.metersRequired as any as Prisma.Decimal);
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

    const pricePaise = rupeesToPaise(dto.priceRupees);
    const gstRateBp = percentToBasisPoints(dto.gstRatePercent);
    const gstAmountPaise = mulPaiseByRateBp(pricePaise, gstRateBp);

    const gstOnTailor = dto.gstOnTailor ?? false;
    const tailorGstRatePercent = dto.tailorGstRatePercent ?? 0;
    if (gstOnTailor && (!Number.isFinite(tailorGstRatePercent) || tailorGstRatePercent <= 0 || tailorGstRatePercent > 100)) {
      throw new BadRequestException('Invalid tailorGstRatePercent');
    }
    const tailorGstRateBp = gstOnTailor ? percentToBasisPoints(tailorGstRatePercent) : 0;

    let customerProfileId: string | undefined;
    if (dto.erpCustomerId) {
      const erpCustomer = await this.prisma.customer.findFirst({
        where: { id: dto.erpCustomerId, orgId: user.orgId },
        select: { id: true, isWalkIn: true } as any
      });
      if (!erpCustomer) throw new ForbiddenException('Invalid ERP customer');
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
      selectedColorImageUrl: selectedColor?.imageUrl ?? null,
      measurementProfileName: profile?.measurementName ?? null,
      measurements: dto.measurements ?? {},
      erpMaterialId: erpMaterialId ?? null,
      materialUsageMeters: materialUsageMeters ?? null,
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

    const totalRupees = Number((pricePaise + gstAmountPaise).toString()) / 100;

    const saleOnCredit = dto.paymentMethod === 'CREDIT';
    if (saleOnCredit && !dto.erpCustomerId) throw new BadRequestException('Credit invoice requires erpCustomerId');

    const stitchingService = await this.resolveStitchingServiceProduct(user.orgId);
    if (stitchingService.gstRateBp !== gstRateBp) {
      throw new BadRequestException(
        `GST rate mismatch. ERP Stitching Service product GST is ${(stitchingService.gstRateBp / 100).toFixed(2)}% but order gstRatePercent is ${(gstRateBp / 100).toFixed(2)}%`
      );
    }
    const invoiceResult = await this.erp.createInvoice(user, {
      storeWarehouseId: dto.storeWarehouseId,
      customerId: dto.erpCustomerId,
      saleOnCredit,
      items: [
        {
          productId: stitchingService.id,
          qty: 1,
          unitPriceRupees: dto.priceRupees,
          discountRupees: 0
        }
      ],
      paymentMethod: dto.paymentMethod,
      paymentAmountRupees: saleOnCredit ? 0 : totalRupees,
      upiRef: dto.upiRef
    } as any);

    const invoiceId = (invoiceResult as any)?.invoice?.id;
    await this.prisma.stitchingOrder.update({
      where: { id: order.id },
      data: { erpInvoiceId: invoiceId ?? null }
    });

    if ((dto.tailorCostRupees ?? 0) > 0 && dto.tailorId) {
      const latest = await this.prisma.stitchingOrder.findUnique({
        where: { id: order.id },
        select: { tailorExpenseJournalEntryId: true }
      });
      if (!latest?.tailorExpenseJournalEntryId) {
        const expenseAccountId = await this.resolveTailorExpenseAccountId(user.orgId);
        const result = await this.erp.createExpense(
          { sub: user.sub, orgId: user.orgId },
          {
            storeId: user.storeId,
            expenseAccountId,
            narration: `Tailor cost for order ${order.orderCode}`,
            paymentMethod: 'CASH',
            amountRupees: dto.tailorCostRupees!,
            gstIncluded: true,
            gstOnTailor,
            gstRatePercent: gstOnTailor ? tailorGstRatePercent : 0
          }
        );
        await this.prisma.stitchingOrder.update({
          where: { id: order.id },
          data: { tailorExpenseJournalEntryId: (result as any)?.journalEntryId ?? null, tailorExpensePostedAt: new Date() }
        });
      }
    }

    return { orderId: order.id, orderCode: order.orderCode, erpInvoice: (invoiceResult as any)?.invoice ?? null };
  }

  async assignTailor(user: { sub: string; orgId: string; storeId?: string }, id: string, dto: AssignTailorDto) {
    if (!user.storeId) throw new ForbiddenException('User is not assigned to a store');
    const existing = await this.get(user.orgId, id);

    const gstOnTailor = dto.gstOnTailor ?? existing.gstOnTailor ?? false;
    const tailorGstRatePercent = dto.tailorGstRatePercent ?? (existing.tailorGstRateBp ? existing.tailorGstRateBp / 100 : 0);
    if (gstOnTailor && (!Number.isFinite(tailorGstRatePercent) || tailorGstRatePercent <= 0 || tailorGstRatePercent > 100)) {
      throw new BadRequestException('Invalid tailorGstRatePercent');
    }
    const tailorGstRateBp = gstOnTailor ? percentToBasisPoints(tailorGstRatePercent) : 0;

    const updated = await this.prisma.stitchingOrder.update({
      where: { id },
      data: {
        tailorId: dto.tailorId,
        tailorCostPaise: dto.tailorCostRupees !== undefined ? rupeesToPaise(dto.tailorCostRupees) : undefined,
        gstOnTailor,
        tailorGstRateBp
      }
    });

    if ((dto.tailorCostRupees ?? 0) > 0 && !existing.tailorExpenseJournalEntryId) {
      const expenseAccountId = await this.resolveTailorExpenseAccountId(user.orgId);
      const result = await this.erp.createExpense(
        { sub: user.sub, orgId: user.orgId },
        {
          storeId: user.storeId,
          expenseAccountId,
          narration: `Tailor cost for order ${updated.orderCode}`,
          paymentMethod: 'CASH',
          amountRupees: dto.tailorCostRupees!,
          gstIncluded: true,
          gstOnTailor,
          gstRatePercent: gstOnTailor ? tailorGstRatePercent : 0
        }
      );
      await this.prisma.stitchingOrder.update({
        where: { id: updated.id },
        data: { tailorExpenseJournalEntryId: (result as any)?.journalEntryId ?? null, tailorExpensePostedAt: new Date() }
      });
    }

    return { order: updated };
  }

  async updateStatus(orgId: string, id: string, dto: UpdateOrderStatusDto) {
    await this.get(orgId, id);
    return {
      order: await this.prisma.stitchingOrder.update({
        where: { id },
        data: { status: dto.status }
      })
    };
  }

  async customerBillPdf(orgId: string, id: string) {
    const order = await this.get(orgId, id);
    const store = (order as any).storeId
      ? await this.prisma.store.findFirst({
          where: { id: (order as any).storeId, orgId },
          select: { name: true, gstin: true, phone: true, address: true }
        })
      : null;
    const org = !store
      ? await this.prisma.organization.findFirst({
          where: { id: orgId },
          select: { name: true }
        })
      : null;
    const customer = order.customerProfile?.erpCustomer;
    const imageUrl = await this.resolveOrderImageUrlForDocs(orgId, (order as any).selectedColorImageUrl);
    const productCategory = (order as any)?.productTemplate?.categoryRef?.name ?? order.productTemplate.category;
    const html = renderStitchingCustomerBillA4({
      storeName: store?.name ?? org?.name ?? 'Shr-x ERP',
      gstin: store?.gstin ?? undefined,
      storePhone: store?.phone ?? undefined,
      storeAddress: store?.address ?? undefined,
      orderCode: order.orderCode,
      invoiceNo: undefined,
      customerName: customer?.fullName ?? 'Walk-in',
      customerPhone: customer?.phone ?? undefined,
      productName: order.productTemplate.name,
      productCategory,
      materialSource: (order as any).materialSource,
      materialName: (order as any)?.erpMaterial ? `${(order as any).erpMaterial.name} (${(order as any).erpMaterial.code})` : undefined,
      materialUsageMeters: order.materialUsageMeters?.toString(),
      colorName: (order as any).selectedColorName ?? undefined,
      colorCode: order.selectedColorCode,
      imageUrl,
      deliveryDate: order.deliveryDate.toISOString().slice(0, 10),
      measurements: (order.measurements ?? {}) as any,
      priceRupees: (Number(order.pricePaise) / 100).toFixed(2),
      gstRupees: (Number(order.gstAmountPaise) / 100).toFixed(2),
      totalRupees: (Number(order.pricePaise + order.gstAmountPaise) / 100).toFixed(2)
    });
    return htmlToPdfBuffer(html);
  }

  async customerBillThermalHtml(orgId: string, id: string) {
    const order = await this.get(orgId, id);
    const store = (order as any).storeId
      ? await this.prisma.store.findFirst({
          where: { id: (order as any).storeId, orgId },
          select: { name: true, gstin: true }
        })
      : null;
    const org = !store
      ? await this.prisma.organization.findFirst({
          where: { id: orgId },
          select: { name: true }
        })
      : null;
    const customer = order.customerProfile?.erpCustomer;
    return renderStitchingCustomerBillThermal({
      storeName: store?.name ?? org?.name ?? 'Shr-x ERP',
      gstin: store?.gstin ?? undefined,
      orderCode: order.orderCode,
      invoiceNo: undefined,
      customerName: customer?.fullName ?? 'Walk-in',
      customerPhone: customer?.phone ?? undefined,
      productName: order.productTemplate.name,
      materialSource: (order as any).materialSource,
      materialName: (order as any)?.erpMaterial ? `${(order as any).erpMaterial.name} (${(order as any).erpMaterial.code})` : undefined,
      materialUsageMeters: order.materialUsageMeters?.toString(),
      colorName: (order as any).selectedColorName ?? undefined,
      colorCode: order.selectedColorCode,
      deliveryDate: order.deliveryDate.toISOString().slice(0, 10),
      priceRupees: (Number(order.pricePaise) / 100).toFixed(2),
      gstRupees: (Number(order.gstAmountPaise) / 100).toFixed(2),
      totalRupees: (Number(order.pricePaise + order.gstAmountPaise) / 100).toFixed(2)
    });
  }

  async tailorSlipPdf(orgId: string, id: string) {
    const order = await this.get(orgId, id);
    const store = (order as any).storeId
      ? await this.prisma.store.findFirst({
          where: { id: (order as any).storeId, orgId },
          select: { name: true, gstin: true, phone: true, address: true }
        })
      : null;
    const org = !store
      ? await this.prisma.organization.findFirst({
          where: { id: orgId },
          select: { name: true }
        })
      : null;
    const imageUrl = await this.resolveOrderImageUrlForDocs(orgId, (order as any).selectedColorImageUrl);
    const productCategory = (order as any)?.productTemplate?.categoryRef?.name ?? order.productTemplate.category;
    const html = renderStitchingTailorSlipA4({
      storeName: store?.name ?? org?.name ?? 'Shr-x ERP',
      gstin: store?.gstin ?? undefined,
      storePhone: store?.phone ?? undefined,
      storeAddress: store?.address ?? undefined,
      orderCode: order.orderCode,
      productName: order.productTemplate.name,
      productCategory,
      materialSource: (order as any).materialSource,
      materialName: (order as any)?.erpMaterial ? `${(order as any).erpMaterial.name} (${(order as any).erpMaterial.code})` : undefined,
      colorName: (order as any).selectedColorName ?? undefined,
      colorCode: order.selectedColorCode,
      imageUrl,
      deliveryDate: order.deliveryDate.toISOString().slice(0, 10),
      measurements: (order.measurements ?? {}) as any,
      materialUsageMeters: order.materialUsageMeters?.toString()
    });
    return htmlToPdfBuffer(html);
  }

  async tailorSlipThermalHtml(orgId: string, id: string) {
    const order = await this.get(orgId, id);
    const store = (order as any).storeId
      ? await this.prisma.store.findFirst({
          where: { id: (order as any).storeId, orgId },
          select: { name: true, gstin: true }
        })
      : null;
    const org = !store
      ? await this.prisma.organization.findFirst({
          where: { id: orgId },
          select: { name: true }
        })
      : null;
    const imageUrl = await this.resolveOrderImageUrlForDocs(orgId, (order as any).selectedColorImageUrl);
    return renderStitchingTailorSlipThermal({
      storeName: store?.name ?? org?.name ?? 'Shr-x ERP',
      gstin: store?.gstin ?? undefined,
      orderCode: order.orderCode,
      productName: order.productTemplate.name,
      materialSource: (order as any).materialSource,
      materialName: (order as any)?.erpMaterial ? `${(order as any).erpMaterial.name} (${(order as any).erpMaterial.code})` : undefined,
      colorName: (order as any).selectedColorName ?? undefined,
      colorCode: order.selectedColorCode,
      imageUrl,
      deliveryDate: order.deliveryDate.toISOString().slice(0, 10),
      measurements: (order.measurements ?? {}) as any,
      materialUsageMeters: order.materialUsageMeters?.toString()
    });
  }

  private async createWithUniqueCode(
    orgId: string,
    data: Omit<
      Prisma.StitchingOrderUncheckedCreateInput,
      'id' | 'orgId' | 'orderCode' | 'createdAt' | 'updatedAt'
    >
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

  private async resolveStitchingServiceProduct(orgId: string) {
    const code = env.STITCHING_SERVICE_PRODUCT_CODE?.trim() ? env.STITCHING_SERVICE_PRODUCT_CODE.trim() : 'STITCH-SVC';
    const product = await this.prisma.product.findFirst({
      where: { orgId, code, isActive: true },
      select: { id: true, gstRateBp: true }
    });
    if (!product) throw new BadRequestException(`Missing ERP Stitching Service product. Create ERP product with code "${code}"`);
    return product;
  }

  private async resolveTailorExpenseAccountId(orgId: string) {
    const code = env.STITCHING_TAILOR_EXPENSE_ACCOUNT_CODE?.trim()
      ? env.STITCHING_TAILOR_EXPENSE_ACCOUNT_CODE.trim()
      : 'EXPENSE_TAILORING';
    const acc = await this.prisma.chartAccount.findFirst({
      where: { orgId, code, type: 'EXPENSE' as any },
      select: { id: true }
    });
    if (!acc) throw new BadRequestException(`Missing ERP tailor expense account. Create EXPENSE account with code "${code}"`);
    return acc.id;
  }
}
