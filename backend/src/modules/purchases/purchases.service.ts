import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InvoiceTaxRegime, Prisma, StockMoveType } from '.prisma/client';
import { AccountingService } from '../accounting/accounting.service';
import { PrismaService } from '../prisma/prisma.service';
import { rupeesToPaise } from '../products/money';
import { mulPaiseByQtyMilli, mulPaiseByRateBp, qtyToMilli } from '../sales/sales.math';
import { randomBytes } from 'node:crypto';

function parseLocalDateOnly(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) throw new BadRequestException('Invalid invoiceDate');
  return d;
}

@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService
  ) {}

  async createSupplier(orgId: string, input: { name: string; gstin?: string; stateCode?: string }) {
    return this.prisma.supplier.create({
      data: {
        orgId,
        name: input.name,
        gstin: input.gstin && input.gstin.trim() !== '' ? input.gstin : null,
        stateCode: input.stateCode && input.stateCode.trim() !== '' ? input.stateCode : null
      },
      select: { id: true, name: true, gstin: true, stateCode: true, createdAt: true }
    });
  }

  async listSuppliers(orgId: string, q?: string) {
    const query = q?.trim();
    return this.prisma.supplier.findMany({
      where: {
        orgId,
        ...(query ? { name: { contains: query, mode: 'insensitive' } } : {})
      },
      orderBy: { name: 'asc' },
      take: query ? 50 : 500,
      select: { id: true, name: true, gstin: true, stateCode: true, createdAt: true }
    });
  }

  async createPurchaseInvoice(
    user: { sub: string; orgId: string; storeId?: string },
    input: {
      storeWarehouseId: string;
      supplierId: string;
      supplierStateCode?: string;
      supplierInvoiceNo: string;
      invoiceDate: string;
      items: Array<{
        productId: string;
        sizeLabel?: string;
        batchNo: string;
        expiryDate?: string;
        qty: number;
        unitCostRupees: number;
      }>;
    }
  ) {
    if (!user.storeId) throw new ForbiddenException('User is not assigned to a store');

    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: input.storeWarehouseId, orgId: user.orgId, storeId: user.storeId },
      select: { id: true, storeId: true }
    });
    if (!warehouse) throw new ForbiddenException('Invalid store warehouse');

    const store = await this.prisma.store.findFirst({
      where: { id: user.storeId, orgId: user.orgId },
      select: { id: true, stateCode: true }
    });
    if (!store) throw new ForbiddenException('Invalid store');

    const supplier = await this.prisma.supplier.findFirst({
      where: { id: input.supplierId, orgId: user.orgId },
      select: { id: true, name: true, gstin: true, stateCode: true }
    });
    if (!supplier) throw new ForbiddenException('Invalid supplier');

    const invoiceDate = parseLocalDateOnly(input.invoiceDate);

    const baseProductIds = [...new Set(input.items.map((i) => i.productId))];
    const products = await this.prisma.product.findMany({
      where: { orgId: user.orgId, id: { in: baseProductIds }, isActive: true },
      select: { id: true, code: true, name: true, sizeLabel: true, parentProductId: true, hsnCode: true, gstRateBp: true, sellingPricePaise: true, costPricePaise: true, imageUrl: true, categoryId: true }
    });
    if (products.length !== baseProductIds.length) throw new BadRequestException('Invalid product in items');
    const productById = new Map(products.map((p) => [p.id, p]));

    const supplierStateCode =
      input.supplierStateCode && input.supplierStateCode.trim() !== ''
        ? input.supplierStateCode.trim()
        : (supplier.stateCode ?? store.stateCode);
    if (!/^\d{2}$/.test(supplierStateCode)) throw new BadRequestException('Invalid supplierStateCode');
    const taxRegime =
      supplierStateCode === store.stateCode
        ? InvoiceTaxRegime.INTRA_STATE
        : InvoiceTaxRegime.INTER_STATE;

    return this.prisma.$transaction(async (tx) => {
      const stockMove = await tx.stockMove.create({
        data: {
          orgId: user.orgId,
          storeId: store.id,
          toWarehouseId: warehouse.id,
          moveType: StockMoveType.PURCHASE,
          sourceRef: input.supplierInvoiceNo
        },
        select: { id: true }
      });

      let subtotalPaise = 0n;
      let cgstTotalPaise = 0n;
      let sgstTotalPaise = 0n;
      let igstTotalPaise = 0n;

      const lineCreates: Array<Prisma.PurchaseInvoiceLineCreateManyInput> = [];
      const batchCreates: Array<{
        productId: string;
        batchNo: string;
        expiryDate: Date | null;
        qty: Prisma.Decimal;
        unitCostPaise: bigint;
      }> = [];

      let lineNo = 1;
      for (const item of input.items) {
        const base = productById.get(item.productId)!;
        const sizeLabel = (item.sizeLabel?.trim() || 'NO_SIZE').toUpperCase();

        const p =
          sizeLabel === 'NO_SIZE'
            ? base
            : await (async () => {
                const existingVariant = await tx.product.findFirst({
                  where: { orgId: user.orgId, parentProductId: base.id, sizeLabel, isActive: true },
                  select: { id: true, code: true, name: true, hsnCode: true, gstRateBp: true }
                });
                if (existingVariant) return existingVariant;

                const baseCode = base.code;
                const codeCandidate = `${baseCode}-${sizeLabel}`;
                const createData = {
                  orgId: user.orgId,
                  parentProductId: base.id,
                  code: codeCandidate,
                  name: base.name,
                  sizeLabel,
                  hsnCode: base.hsnCode,
                  gstRateBp: base.gstRateBp,
                  sellingPricePaise: base.sellingPricePaise,
                  costPricePaise: base.costPricePaise,
                  imageUrl: base.imageUrl,
                  categoryId: base.categoryId
                } as any;

                try {
                  return await tx.product.create({
                    data: createData,
                    select: { id: true, code: true, name: true, hsnCode: true, gstRateBp: true }
                  });
                } catch (e: any) {
                  if (e?.code !== 'P2002') throw e;
                  const alt = `${codeCandidate}-${randomBytes(1).toString('hex').toUpperCase()}`;
                  return await tx.product.create({
                    data: { ...createData, code: alt },
                    select: { id: true, code: true, name: true, hsnCode: true, gstRateBp: true }
                  });
                }
              })();

        const qty = new Prisma.Decimal(item.qty);
        const qtyMilli = qtyToMilli(item.qty);
        const unitCostPaise = rupeesToPaise(item.unitCostRupees);
        if (unitCostPaise < 0n) throw new BadRequestException('Invalid unit cost');

        const expiryDate = item.expiryDate ? parseLocalDateOnly(item.expiryDate) : null;

        const taxableValuePaise = mulPaiseByQtyMilli(unitCostPaise, qtyMilli);

        const gstRateBp = p.gstRateBp;
        let cgstRateBp = 0;
        let sgstRateBp = 0;
        let igstRateBp = 0;

        if (taxRegime === InvoiceTaxRegime.INTRA_STATE) {
          cgstRateBp = Math.floor(gstRateBp / 2);
          sgstRateBp = gstRateBp - cgstRateBp;
        } else {
          igstRateBp = gstRateBp;
        }

        const cgstAmountPaise = cgstRateBp ? mulPaiseByRateBp(taxableValuePaise, cgstRateBp) : 0n;
        const sgstAmountPaise = sgstRateBp ? mulPaiseByRateBp(taxableValuePaise, sgstRateBp) : 0n;
        const igstAmountPaise = igstRateBp ? mulPaiseByRateBp(taxableValuePaise, igstRateBp) : 0n;

        const lineTotalPaise = taxableValuePaise + cgstAmountPaise + sgstAmountPaise + igstAmountPaise;

        subtotalPaise += taxableValuePaise;
        cgstTotalPaise += cgstAmountPaise;
        sgstTotalPaise += sgstAmountPaise;
        igstTotalPaise += igstAmountPaise;

        lineCreates.push({
          orgId: user.orgId,
          purchaseInvoiceId: 'TEMP',
          lineNo,
          productId: p.id,
          hsnCode: p.hsnCode,
          gstRateBp,
          qty,
          unitCostPaise,
          taxableValuePaise,
          cgstRateBp,
          sgstRateBp,
          igstRateBp,
          cgstAmountPaise,
          sgstAmountPaise,
          igstAmountPaise,
          lineTotalPaise
        });

        batchCreates.push({
          productId: p.id,
          batchNo: item.batchNo,
          expiryDate,
          qty,
          unitCostPaise
        });

        lineNo += 1;
      }

      const taxTotalPaise = cgstTotalPaise + sgstTotalPaise + igstTotalPaise;
      const grandTotalPaise = subtotalPaise + taxTotalPaise;

      const invoice = await tx.purchaseInvoice.create({
        data: {
          orgId: user.orgId,
          storeId: store.id,
          supplierId: supplier.id,
          supplierInvoiceNo: input.supplierInvoiceNo,
          invoiceDate,
          subtotalPaise,
          taxTotalPaise,
          cgstTotalPaise,
          sgstTotalPaise,
          igstTotalPaise,
          grandTotalPaise
        },
        select: { id: true }
      });

      await tx.purchaseInvoiceLine.createMany({
        data: lineCreates.map((l) => ({ ...l, purchaseInvoiceId: invoice.id }))
      });

      for (const b of batchCreates) {
        const batch = await tx.inventoryBatch.create({
          data: {
            orgId: user.orgId,
            warehouseId: warehouse.id,
            productId: b.productId,
            batchNo: b.batchNo,
            expiryDate: b.expiryDate,
            unitCostPaise: b.unitCostPaise,
            qtyReceived: b.qty,
            qtyAvailable: b.qty,
            receivedAt: invoiceDate
          },
          select: { id: true, productId: true, unitCostPaise: true }
        });

        await tx.stockMoveLine.create({
          data: {
            orgId: user.orgId,
            stockMoveId: stockMove.id,
            productId: batch.productId,
            batchId: batch.id,
            qtyDelta: b.qty,
            unitCostPaise: batch.unitCostPaise
          }
        });
      }

      await this.accounting.postPurchaseJournal({
        tx,
        orgId: user.orgId,
        storeId: store.id,
        postedByUserId: user.sub,
        purchaseInvoiceId: invoice.id,
        supplierName: supplier.name,
        supplierInvoiceNo: input.supplierInvoiceNo,
        invoiceDate,
        grandTotalPaise,
        taxableSubtotalPaise: subtotalPaise,
        cgstPaise: cgstTotalPaise,
        sgstPaise: sgstTotalPaise,
        igstPaise: igstTotalPaise
      });

      const created = await tx.purchaseInvoice.findFirst({
        where: { id: invoice.id, orgId: user.orgId },
        include: { supplier: true, lines: { orderBy: { lineNo: 'asc' }, include: { product: true } } }
      });

      return { purchaseInvoice: created };
    });
  }

  async listPurchaseInvoices(orgId: string, storeId: string) {
    return this.prisma.purchaseInvoice.findMany({
      where: { orgId, storeId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        supplierInvoiceNo: true,
        invoiceDate: true,
        supplier: { select: { name: true } },
        grandTotalPaise: true,
        createdAt: true
      }
    });
  }

  async getPurchaseInvoice(orgId: string, storeId: string, id: string) {
    return this.prisma.purchaseInvoice.findFirst({
      where: { orgId, storeId, id },
      include: { supplier: true, lines: { orderBy: { lineNo: 'asc' }, include: { product: true } } }
    });
  }
}
