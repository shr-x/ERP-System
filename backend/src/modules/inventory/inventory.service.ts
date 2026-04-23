import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { JournalEntryStatus, JournalSourceType, Prisma, StockMoveType } from '@prisma/client';
import { AccountingService } from '../accounting/accounting.service';
import { SystemAccountCodes } from '../accounting/system-accounts';
import { PrismaService } from '../prisma/prisma.service';
import { rupeesToPaise } from '../products/money';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService
  ) {}

  private zeroDecimal() {
    return new Prisma.Decimal(0);
  }

  async receiveStock(
    orgId: string,
    input: {
      warehouseId: string;
      productId: string;
      batchNo: string;
      expiryDate?: string;
      qty: number;
      unitCostRupees: number;
      receivedAt?: string;
    }
  ) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: input.warehouseId, orgId },
      select: { id: true, storeId: true }
    });
    if (!warehouse) throw new ForbiddenException('Invalid warehouse');

    const product = await this.prisma.product.findFirst({
      where: { id: input.productId, orgId },
      select: { id: true }
    });
    if (!product) throw new ForbiddenException('Invalid product');

    const qty = new Prisma.Decimal(input.qty);
    const unitCostPaise = rupeesToPaise(input.unitCostRupees);
    const receivedAt = input.receivedAt ? new Date(input.receivedAt) : new Date();
    const expiryDate = input.expiryDate ? new Date(input.expiryDate) : null;

    if (Number.isNaN(receivedAt.getTime())) throw new BadRequestException('Invalid receivedAt');
    if (expiryDate && Number.isNaN(expiryDate.getTime())) throw new BadRequestException('Invalid expiryDate');

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const batch = await tx.inventoryBatch.create({
        data: {
          orgId,
          warehouseId: warehouse.id,
          productId: product.id,
          batchNo: input.batchNo,
          expiryDate,
          unitCostPaise,
          qtyReceived: qty,
          qtyAvailable: qty,
          receivedAt
        },
        select: {
          id: true,
          warehouseId: true,
          productId: true,
          batchNo: true,
          expiryDate: true,
          unitCostPaise: true,
          qtyReceived: true,
          qtyAvailable: true,
          receivedAt: true
        }
      });

      const move = await tx.stockMove.create({
        data: {
          orgId,
          storeId: warehouse.storeId,
          moveType: StockMoveType.PURCHASE,
          toWarehouseId: warehouse.id,
          sourceRef: 'RECEIVE'
        },
        select: { id: true, moveType: true, createdAt: true }
      });

      await tx.stockMoveLine.create({
        data: {
          orgId,
          stockMoveId: move.id,
          productId: product.id,
          batchId: batch.id,
          qtyDelta: qty,
          unitCostPaise
        }
      });

      return { batch, move };
    });
  }

  async portalReceiveDirectStock(args: {
    orgId: string;
    storeId: string;
    postedByUserId: string;
    warehouseId: string;
    productId: string;
    qty: number;
    unitCostRupees: number;
    receivedAt?: string;
  }) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: args.warehouseId, orgId: args.orgId },
      select: { id: true, storeId: true }
    });
    if (!warehouse) throw new ForbiddenException('Invalid warehouse');
    if (warehouse.storeId !== args.storeId) throw new ForbiddenException('Warehouse not accessible');

    const product = (await this.prisma.product.findFirst({
      where: { id: args.productId, orgId: args.orgId },
      select: { id: true, isPortalManaged: true, code: true, name: true } as any
    } as any)) as any;
    if (!product) throw new ForbiddenException('Invalid product');
    if (!product.isPortalManaged) throw new BadRequestException('Direct stock is allowed only for portal-managed products');

    if (!Number.isFinite(args.qty) || args.qty <= 0) throw new BadRequestException('Invalid qty');
    if (!Number.isFinite(args.unitCostRupees) || args.unitCostRupees < 0) throw new BadRequestException('Invalid unit cost');

    const receivedAt = args.receivedAt ? new Date(args.receivedAt) : new Date();
    if (Number.isNaN(receivedAt.getTime())) throw new BadRequestException('Invalid receivedAt');

    const qty = new Prisma.Decimal(args.qty);
    const unitCostPaise = rupeesToPaise(args.unitCostRupees);
    const totalPaiseDecimal = qty.mul(new Prisma.Decimal(unitCostPaise.toString()));
    const totalPaise = BigInt(totalPaiseDecimal.toFixed(0));
    if (totalPaise <= 0n) throw new BadRequestException('Invalid total cost');

    return this.prisma.$transaction(async (tx) => {
      await this.accounting.setupSystemAccounts(args.orgId);

      const accounts = await tx.chartAccount.findMany({
        where: {
          orgId: args.orgId,
          code: { in: [SystemAccountCodes.INVENTORY, SystemAccountCodes.STOCK_ADJUSTMENT_EQUITY] }
        },
        select: { id: true, code: true }
      });
      const byCode = new Map(accounts.map((a) => [a.code, a.id]));
      const inventoryAccountId = byCode.get(SystemAccountCodes.INVENTORY);
      const offsetAccountId = byCode.get(SystemAccountCodes.STOCK_ADJUSTMENT_EQUITY);
      if (!inventoryAccountId || !offsetAccountId) throw new BadRequestException('Accounting system accounts are missing');

      const batchNo = `PORTAL-${Date.now().toString().slice(-6)}-${Math.random().toString(16).slice(2, 6).toUpperCase()}`;

      const batch = await tx.inventoryBatch.create({
        data: {
          orgId: args.orgId,
          warehouseId: warehouse.id,
          productId: product.id,
          batchNo,
          expiryDate: null,
          unitCostPaise,
          qtyReceived: qty,
          qtyAvailable: qty,
          receivedAt
        },
        select: { id: true, batchNo: true, qtyReceived: true, unitCostPaise: true, receivedAt: true }
      });

      const move = await tx.stockMove.create({
        data: {
          orgId: args.orgId,
          storeId: args.storeId,
          moveType: StockMoveType.ADJUSTMENT,
          toWarehouseId: warehouse.id,
          sourceRef: 'PORTAL_DIRECT'
        },
        select: { id: true, createdAt: true }
      });

      await tx.stockMoveLine.create({
        data: {
          orgId: args.orgId,
          stockMoveId: move.id,
          productId: product.id,
          batchId: batch.id,
          qtyDelta: qty,
          unitCostPaise
        }
      });

      const lines = [
        { accountId: inventoryAccountId, debitPaise: totalPaise, creditPaise: 0n },
        { accountId: offsetAccountId, debitPaise: 0n, creditPaise: totalPaise }
      ];
      const debit = lines.reduce((s, l) => s + l.debitPaise, 0n);
      const credit = lines.reduce((s, l) => s + l.creditPaise, 0n);
      if (debit !== credit) throw new BadRequestException('Unbalanced journal entry');

      const entry = await tx.journalEntry.create({
        data: {
          orgId: args.orgId,
          storeId: args.storeId,
          entryDate: receivedAt,
          sourceType: JournalSourceType.ADJUSTMENT,
          narration: `Portal stock add ${product.code} ${product.name}`,
          postedByUserId: args.postedByUserId,
          status: JournalEntryStatus.DRAFT
        },
        select: { id: true }
      });

      await tx.journalLine.createMany({
        data: lines.map((l) => ({
          orgId: args.orgId,
          journalEntryId: entry.id,
          accountId: l.accountId,
          debitPaise: l.debitPaise,
          creditPaise: l.creditPaise
        }))
      });

      await tx.journalEntry.update({
        where: { id: entry.id },
        data: { status: JournalEntryStatus.POSTED }
      });

      return { batch, move, totalPaise: totalPaise.toString() };
    });
  }

  async transferStock(
    orgId: string,
    input: { fromWarehouseId: string; toWarehouseId: string; productId: string; qty: number }
  ) {
    if (input.fromWarehouseId === input.toWarehouseId) {
      throw new BadRequestException('fromWarehouseId and toWarehouseId must differ');
    }

    const [fromWarehouse, toWarehouse] = await Promise.all([
      this.prisma.warehouse.findFirst({
        where: { id: input.fromWarehouseId, orgId },
        select: { id: true, storeId: true }
      }),
      this.prisma.warehouse.findFirst({
        where: { id: input.toWarehouseId, orgId },
        select: { id: true, storeId: true }
      })
    ]);
    if (!fromWarehouse) throw new ForbiddenException('Invalid fromWarehouse');
    if (!toWarehouse) throw new ForbiddenException('Invalid toWarehouse');

    const product = await this.prisma.product.findFirst({
      where: { id: input.productId, orgId },
      select: { id: true }
    });
    if (!product) throw new ForbiddenException('Invalid product');

    const requestedQty = new Prisma.Decimal(input.qty);

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const batches = await tx.inventoryBatch.findMany({
        where: {
          orgId,
          warehouseId: fromWarehouse.id,
          productId: product.id,
          qtyAvailable: { gt: new Prisma.Decimal(0) }
        },
        orderBy: { receivedAt: 'asc' },
        select: {
          id: true,
          batchNo: true,
          expiryDate: true,
          unitCostPaise: true,
          qtyAvailable: true,
          receivedAt: true
        }
      });

      let remaining = requestedQty;
      const allocations: Array<{ fromBatchId: string; qty: Prisma.Decimal }> = [];

      for (const b of batches) {
        if (remaining.lte(0)) break;
        const takeQty = Prisma.Decimal.min(b.qtyAvailable, remaining);
        if (takeQty.lte(0)) continue;
        allocations.push({ fromBatchId: b.id, qty: takeQty });
        remaining = remaining.sub(takeQty);
      }

      if (remaining.gt(0)) throw new BadRequestException('Insufficient stock for transfer');

      const move = await tx.stockMove.create({
        data: {
          orgId,
          storeId: fromWarehouse.storeId,
          fromWarehouseId: fromWarehouse.id,
          toWarehouseId: toWarehouse.id,
          moveType: StockMoveType.TRANSFER_OUT,
          sourceRef: 'TRANSFER'
        },
        select: { id: true, createdAt: true }
      });

      const created: Array<{
        fromBatchId: string;
        toBatchId: string;
        qty: Prisma.Decimal;
      }> = [];

      for (const a of allocations) {
        const fromBatch = batches.find((b) => b.id === a.fromBatchId)!;

        await tx.inventoryBatch.update({
          where: { id: fromBatch.id },
          data: { qtyAvailable: { decrement: a.qty } }
        });

        await tx.stockMoveLine.create({
          data: {
            orgId,
            stockMoveId: move.id,
            productId: product.id,
            batchId: fromBatch.id,
            qtyDelta: a.qty.mul(-1)
          }
        });

        const toBatch = await tx.inventoryBatch.create({
          data: {
            orgId,
            warehouseId: toWarehouse.id,
            productId: product.id,
            batchNo: fromBatch.batchNo,
            expiryDate: fromBatch.expiryDate,
            unitCostPaise: fromBatch.unitCostPaise,
            qtyReceived: a.qty,
            qtyAvailable: a.qty,
            receivedAt: fromBatch.receivedAt
          },
          select: { id: true }
        });

        await tx.stockMoveLine.create({
          data: {
            orgId,
            stockMoveId: move.id,
            productId: product.id,
            batchId: toBatch.id,
            qtyDelta: a.qty
          }
        });

        created.push({ fromBatchId: fromBatch.id, toBatchId: toBatch.id, qty: a.qty });
      }

      return { move, allocations: created };
    });
  }

  async listStock(orgId: string, warehouseId: string, q?: string) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: warehouseId, orgId },
      select: { id: true }
    });
    if (!warehouse) throw new ForbiddenException('Invalid warehouse');

    const query = q?.trim();
    const products = (await this.prisma.product.findMany({
      where: {
        orgId,
        isActive: true,
        AND: [
          {
            OR: [
              { parentProductId: { not: null } },
              { parentProductId: null, variants: { none: {} } }
            ]
          },
          ...(query
            ? [
                {
                  OR: [
                    { code: { contains: query, mode: Prisma.QueryMode.insensitive } },
                    { name: { contains: query, mode: Prisma.QueryMode.insensitive } }
                  ]
                }
              ]
            : [])
        ]
      } as any,
      orderBy: { name: 'asc' } as any,
      take: query ? 50 : 1000,
      select: { id: true, code: true, name: true, parentProductId: true, sizeLabel: true, hsnCode: true, gstRateBp: true, sellingPricePaise: true, imageUrl: true } as any
    } as any)) as any[];

    const ids = products.map((p) => p.id);
    if (ids.length === 0) return { stock: [] };

    const grouped = await this.prisma.inventoryBatch.groupBy({
      by: [Prisma.InventoryBatchScalarFieldEnum.productId],
      where: { orgId, warehouseId, productId: { in: ids } },
      _sum: { qtyAvailable: true }
    });

    const qtyByProduct = new Map(
      grouped.map((g) => [g.productId, g._sum.qtyAvailable ?? this.zeroDecimal()])
    );

    return {
      stock: products.map((p) => ({
        product: p,
        qtyAvailable: (qtyByProduct.get(p.id) ?? this.zeroDecimal()).toString()
      }))
    };
  }

  async listStockForStore(orgId: string, storeId: string, q?: string) {
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, orgId, isActive: true },
      select: { id: true }
    });
    if (!store) throw new ForbiddenException('Invalid store');

    const warehouseIds = (
      await this.prisma.warehouse.findMany({
        where: { orgId, storeId: store.id },
        select: { id: true }
      })
    ).map((w: { id: string }) => w.id);

    const query = q?.trim();
    const products = (await this.prisma.product.findMany({
      where: {
        orgId,
        isActive: true,
        AND: [
          {
            OR: [
              { parentProductId: { not: null } },
              { parentProductId: null, variants: { none: {} } }
            ]
          },
          ...(query
            ? [
                {
                  OR: [
                    { code: { contains: query, mode: Prisma.QueryMode.insensitive } },
                    { name: { contains: query, mode: Prisma.QueryMode.insensitive } }
                  ]
                }
              ]
            : [])
        ]
      } as any,
      orderBy: { name: 'asc' } as any,
      take: query ? 50 : 1000,
      select: { id: true, code: true, name: true, parentProductId: true, sizeLabel: true, hsnCode: true, gstRateBp: true, sellingPricePaise: true, imageUrl: true } as any
    } as any)) as any[];

    const ids = products.map((p) => p.id);
    if (ids.length === 0) return { stock: [] };
    if (warehouseIds.length === 0) {
      return { stock: products.map((p) => ({ product: p, qtyAvailable: '0' })) };
    }

    const grouped = await this.prisma.inventoryBatch.groupBy({
      by: [Prisma.InventoryBatchScalarFieldEnum.productId],
      where: { orgId, warehouseId: { in: warehouseIds }, productId: { in: ids } },
      _sum: { qtyAvailable: true }
    });

    const qtyByProduct = new Map(
      grouped.map((g) => [g.productId, g._sum.qtyAvailable ?? this.zeroDecimal()])
    );

    return {
      stock: products.map((p) => ({
        product: p,
        qtyAvailable: (qtyByProduct.get(p.id) ?? this.zeroDecimal()).toString()
      }))
    };
  }

  async listBatches(orgId: string, warehouseId: string, productId: string) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: warehouseId, orgId },
      select: { id: true }
    });
    if (!warehouse) throw new ForbiddenException('Invalid warehouse');

    const product = await this.prisma.product.findFirst({
      where: { id: productId, orgId },
      select: { id: true }
    });
    if (!product) throw new ForbiddenException('Invalid product');

    const batches = await this.prisma.inventoryBatch.findMany({
      where: { orgId, warehouseId, productId },
      orderBy: { receivedAt: 'asc' },
      select: {
        id: true,
        batchNo: true,
        expiryDate: true,
        unitCostPaise: true,
        qtyReceived: true,
        qtyAvailable: true,
        receivedAt: true
      }
    });

    return { batches };
  }

  async restockWarehouseToMinimum(orgId: string, input: { warehouseId: string; targetQty: number }) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: input.warehouseId, orgId },
      select: { id: true }
    });
    if (!warehouse) throw new ForbiddenException('Invalid warehouse');

    const products = (await this.prisma.product.findMany({
      where: { orgId, isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, code: true }
    })) as Array<{ id: string; code: string }>;
    if (products.length === 0) return { restocked: 0, skipped: 0, targetQty: input.targetQty };

    const grouped = await this.prisma.inventoryBatch.groupBy({
      by: [Prisma.InventoryBatchScalarFieldEnum.productId],
      where: { orgId, warehouseId: warehouse.id, productId: { in: products.map((p) => p.id) } },
      _sum: { qtyAvailable: true }
    });

    const qtyByProduct = new Map(
      grouped.map((g) => [g.productId, g._sum.qtyAvailable ?? this.zeroDecimal()])
    );

    let restocked = 0;
    let skipped = 0;
    const ts = Date.now();

    for (const p of products) {
      const current = Number((qtyByProduct.get(p.id) ?? this.zeroDecimal()).toString());
      if (!Number.isFinite(current)) {
        skipped += 1;
        continue;
      }
      if (current >= input.targetQty) {
        skipped += 1;
        continue;
      }
      const delta = input.targetQty - current;
      await this.receiveStock(orgId, {
        warehouseId: warehouse.id,
        productId: p.id,
        batchNo: `RESTOCK-${input.targetQty}-${ts}-${p.code}`,
        qty: delta,
        unitCostRupees: 0
      });
      restocked += 1;
    }

    return { restocked, skipped, targetQty: input.targetQty };
  }
}
