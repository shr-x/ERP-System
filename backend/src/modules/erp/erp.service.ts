import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '.prisma/client';
import { AccountingService } from '../accounting/accounting.service';
import { SystemAccountCodes } from '../accounting/system-accounts';
import { rupeesToPaise } from '../products/money';
import { PrismaService } from '../prisma/prisma.service';
import { SalesService } from '../sales/sales.service';
import type { CreateErpExpenseDto, CreateErpInvoiceDto } from './erp.dtos';

@Injectable()
export class ErpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sales: SalesService,
    private readonly accounting: AccountingService
  ) {}

  async listDressMaterials(orgId: string, input: { storeId?: string; q?: string; page: number; pageSize: number }) {
    const category = await this.prisma.productCategory.findFirst({
      where: {
        orgId,
        OR: [
          { name: { equals: 'Dress Material', mode: Prisma.QueryMode.insensitive } },
          { name: { equals: 'Dress Materials', mode: Prisma.QueryMode.insensitive } }
        ]
      },
      select: { id: true }
    });
    if (!category) return { total: 0, page: input.page, pageSize: input.pageSize, materials: [] };

    const q = input.q?.trim();
    const where: Prisma.ProductWhereInput = {
      orgId,
      isActive: true,
      categoryId: category.id,
      ...(q
        ? {
            OR: [
              { code: { contains: q, mode: Prisma.QueryMode.insensitive } },
              { name: { contains: q, mode: Prisma.QueryMode.insensitive } }
            ]
          }
        : {})
    };

    const [total, products] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        select: { id: true, code: true, name: true, imageUrl: true }
      })
    ]);

    const productIds = products.map((p) => p.id);
    if (productIds.length === 0) return { total, page: input.page, pageSize: input.pageSize, materials: [] };

    let warehouseIds: string[] | undefined;
    if (input.storeId) {
      const store = await this.prisma.store.findFirst({
        where: { id: input.storeId, orgId, isActive: true },
        select: { id: true }
      });
      if (!store) throw new ForbiddenException('Invalid store');
      warehouseIds = (
        await this.prisma.warehouse.findMany({
          where: { orgId, storeId: store.id, isActive: true },
          select: { id: true }
        })
      ).map((w) => w.id);
    }

    const grouped = await this.prisma.inventoryBatch.groupBy({
      by: [Prisma.InventoryBatchScalarFieldEnum.productId],
      where: { orgId, ...(warehouseIds ? { warehouseId: { in: warehouseIds } } : {}), productId: { in: productIds } },
      _sum: { qtyAvailable: true }
    });
    const qtyByProductId = new Map(
      grouped.map((g) => [g.productId, (g._sum.qtyAvailable ?? new Prisma.Decimal(0)).toString()])
    );

    return {
      total,
      page: input.page,
      pageSize: input.pageSize,
      materials: products.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        imageUrl: p.imageUrl,
        qtyAvailableMeters: qtyByProductId.get(p.id) ?? '0'
      }))
    };
  }

  async listDressMaterialsByIds(orgId: string, input: { storeId?: string; ids: string[] }) {
    const category = await this.prisma.productCategory.findFirst({
      where: {
        orgId,
        OR: [
          { name: { equals: 'Dress Material', mode: Prisma.QueryMode.insensitive } },
          { name: { equals: 'Dress Materials', mode: Prisma.QueryMode.insensitive } }
        ]
      },
      select: { id: true }
    });
    if (!category) return { materials: [] };

    const ids = Array.from(new Set(input.ids)).slice(0, 200);
    if (ids.length === 0) return { materials: [] };

    const products = await this.prisma.product.findMany({
      where: { orgId, isActive: true, categoryId: category.id, id: { in: ids } },
      orderBy: { name: 'asc' },
      select: { id: true, code: true, name: true, imageUrl: true }
    });

    const productIds = products.map((p) => p.id);
    if (productIds.length === 0) return { materials: [] };

    let warehouseIds: string[] | undefined;
    if (input.storeId) {
      const store = await this.prisma.store.findFirst({
        where: { id: input.storeId, orgId, isActive: true },
        select: { id: true }
      });
      if (!store) throw new ForbiddenException('Invalid store');
      warehouseIds = (
        await this.prisma.warehouse.findMany({
          where: { orgId, storeId: store.id, isActive: true },
          select: { id: true }
        })
      ).map((w) => w.id);
    }

    const grouped = await this.prisma.inventoryBatch.groupBy({
      by: [Prisma.InventoryBatchScalarFieldEnum.productId],
      where: { orgId, ...(warehouseIds ? { warehouseId: { in: warehouseIds } } : {}), productId: { in: productIds } },
      _sum: { qtyAvailable: true }
    });
    const qtyByProductId = new Map(
      grouped.map((g) => [g.productId, (g._sum.qtyAvailable ?? new Prisma.Decimal(0)).toString()])
    );

    return {
      materials: products.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        imageUrl: p.imageUrl,
        qtyAvailableMeters: qtyByProductId.get(p.id) ?? '0'
      }))
    };
  }

  async getCustomer(orgId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { orgId, id },
      select: {
        id: true,
        fullName: true,
        phone: true,
        gstin: true,
        isBusiness: true,
        stateCode: true,
        address: true,
        pincode: true,
        isWalkIn: true
      } as any
    });
    if (!customer) throw new ForbiddenException('Invalid customer');

    const loyaltyAgg = await this.prisma.loyaltyLedger.aggregate({
      where: { orgId, customerId: id },
      _sum: { pointsDelta: true }
    });
    const loyaltyPoints = loyaltyAgg._sum.pointsDelta ?? 0;
    return { ...customer, loyaltyPoints };
  }

  async createInvoice(user: { sub: string; orgId: string; storeId?: string }, dto: CreateErpInvoiceDto) {
    const payment = { method: dto.paymentMethod, amountRupees: dto.paymentAmountRupees, upiRef: dto.upiRef };
    return this.sales.createSalesInvoice(user, {
      storeWarehouseId: dto.storeWarehouseId,
      customerId: dto.customerId,
      saleOnCredit: dto.saleOnCredit,
      placeOfSupplyStateCode: dto.placeOfSupplyStateCode,
      deliveryAddress: dto.deliveryAddress,
      deliveryPincode: dto.deliveryPincode,
      loyaltyRedeemPoints: 0,
      couponCode: '',
      customerCreditApplyRupees: 0,
      creditSettlementRupees: 0,
      items: dto.items,
      payment
    } as any);
  }

  async createExpense(user: { sub: string; orgId: string }, dto: CreateErpExpenseDto) {
    await this.accounting.setupSystemAccounts(user.orgId);
    const store = await this.prisma.store.findFirst({
      where: { id: dto.storeId, orgId: user.orgId, isActive: true },
      select: { id: true, stateCode: true }
    });
    if (!store) throw new ForbiddenException('Invalid store');

    const accounts = await this.prisma.chartAccount.findMany({
      where: { orgId: user.orgId, code: { in: [SystemAccountCodes.CASH, SystemAccountCodes.UPI_CLEARING, SystemAccountCodes.INPUT_CGST, SystemAccountCodes.INPUT_SGST] } },
      select: { id: true, code: true }
    });
    const byCode = new Map(accounts.map((a) => [a.code, a.id]));

    const paymentAccountId =
      dto.paymentMethod === 'CASH' ? byCode.get(SystemAccountCodes.CASH) : byCode.get(SystemAccountCodes.UPI_CLEARING);
    const inputCgstId = byCode.get(SystemAccountCodes.INPUT_CGST);
    const inputSgstId = byCode.get(SystemAccountCodes.INPUT_SGST);
    if (!paymentAccountId || !inputCgstId || !inputSgstId) {
      throw new BadRequestException('System accounts are missing');
    }

    const totalPaise = rupeesToPaise(dto.amountRupees);
    if (totalPaise <= 0n) throw new BadRequestException('Invalid amount');

    const gstOnTailor = !!dto.gstOnTailor;
    const gstIncluded = dto.gstIncluded !== false;
    const gstRatePercent = dto.gstRatePercent ?? 0;

    let taxablePaise = totalPaise;
    let gstPaise = 0n;

    if (gstOnTailor) {
      if (gstRatePercent <= 0 || gstRatePercent > 100) throw new BadRequestException('Invalid gstRatePercent');
      const rateBp = Math.round(gstRatePercent * 100);

      if (gstIncluded) {
        const denom = 10000 + rateBp;
        taxablePaise = (totalPaise * 10000n + BigInt(Math.floor(denom / 2))) / BigInt(denom);
        gstPaise = totalPaise - taxablePaise;
      } else {
        gstPaise = (totalPaise * BigInt(rateBp) + 5000n) / 10000n;
        taxablePaise = totalPaise;
      }
    }

    const cgstPaise = gstPaise > 0n ? gstPaise / 2n : 0n;
    const sgstPaise = gstPaise > 0n ? gstPaise - cgstPaise : 0n;
    const creditPaise = gstIncluded ? totalPaise : taxablePaise + gstPaise;

    const lines: Array<{ accountId: string; debitPaise: bigint; creditPaise: bigint }> = [
      { accountId: dto.expenseAccountId, debitPaise: taxablePaise, creditPaise: 0n }
    ];
    if (cgstPaise > 0n) lines.push({ accountId: inputCgstId, debitPaise: cgstPaise, creditPaise: 0n });
    if (sgstPaise > 0n) lines.push({ accountId: inputSgstId, debitPaise: sgstPaise, creditPaise: 0n });
    lines.push({ accountId: paymentAccountId, debitPaise: 0n, creditPaise });

    return this.accounting.createManualJournalEntry({
      orgId: user.orgId,
      storeId: store.id,
      postedByUserId: user.sub,
      entryDate: new Date(),
      narration: dto.narration,
      lines
    });
  }

  async assertMaterialAvailability(orgId: string, input: { erpMaterialId: string; metersNeeded: number; storeId?: string }) {
    const metersNeeded = new Prisma.Decimal(input.metersNeeded);
    if (!metersNeeded.isFinite() || metersNeeded.lte(0)) throw new BadRequestException('Invalid metersNeeded');

    let warehouseIds: string[] | undefined;
    if (input.storeId) {
      const store = await this.prisma.store.findFirst({
        where: { id: input.storeId, orgId, isActive: true },
        select: { id: true }
      });
      if (!store) throw new ForbiddenException('Invalid store');
      warehouseIds = (
        await this.prisma.warehouse.findMany({
          where: { orgId, storeId: store.id, isActive: true },
          select: { id: true }
        })
      ).map((w) => w.id);
    }

    const agg = await this.prisma.inventoryBatch.aggregate({
      where: { orgId, ...(warehouseIds ? { warehouseId: { in: warehouseIds } } : {}), productId: input.erpMaterialId },
      _sum: { qtyAvailable: true }
    });
    const available = agg._sum.qtyAvailable ?? new Prisma.Decimal(0);
    if (available.lt(metersNeeded)) {
      throw new BadRequestException(`Insufficient dress material. Available ${available.toString()}m`);
    }
    return { availableMeters: available.toString() };
  }
}
