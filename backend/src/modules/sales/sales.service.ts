import { randomBytes } from 'node:crypto';
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InvoiceTaxRegime, JournalSourceType, LoyaltySourceType, PaymentMethod, Prisma, ReturnCreditMode, SalesInvoiceStatus, StockMoveType } from '.prisma/client';
import { AccountingService } from '../accounting/accounting.service';
import { CouponsService } from '../coupons/coupons.service';
import { PrismaService } from '../prisma/prisma.service';
import { rupeesToPaise } from '../products/money';
import { financialYearString, mulPaiseByQtyMilli, mulPaiseByRateBp, qtyToMilli } from './sales.math';

type CreateSalesInvoiceInput = {
  storeWarehouseId: string;
  customerId?: string;
  saleOnCredit?: boolean;
  placeOfSupplyStateCode?: string;
  deliveryAddress?: string;
  deliveryPincode?: string;
  loyaltyRedeemPoints?: number;
  couponCode?: string;
  customerCreditApplyRupees?: number;
  creditSettlementRupees?: number;
  items: Array<{
    productId: string;
    qty: number;
    unitPriceRupees?: number;
    discountRupees?: number;
  }>;
  payment: { method: 'CASH' | 'UPI' | 'DEBIT_CARD' | 'CREDIT'; amountRupees: number; upiRef?: string };
};

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
    private readonly coupons: CouponsService
  ) {}

  async createSalesInvoice(
    user: { sub: string; orgId: string; storeId?: string },
    input: CreateSalesInvoiceInput
  ) {
    if (!user.storeId) throw new ForbiddenException('User is not assigned to a store');
    await this.accounting.setupSystemAccounts(user.orgId);

    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: input.storeWarehouseId, orgId: user.orgId, storeId: user.storeId },
      select: { id: true, storeId: true }
    });
    if (!warehouse) throw new ForbiddenException('Invalid store warehouse');

    const store = await this.prisma.store.findFirst({
      where: { id: user.storeId, orgId: user.orgId },
      select: { id: true, code: true, stateCode: true }
    });
    if (!store) throw new ForbiddenException('Invalid store');

    const org = await this.prisma.organization.findFirst({
      where: { id: user.orgId },
      select: { id: true, gstin: true, stateCode: true }
    });
    if (!org?.gstin) throw new BadRequestException('Seller GSTIN not configured');
    const sellerGstin = org.gstin;

    const requestedCustomerId = input.customerId;
    const customerId = requestedCustomerId
      ? input.customerId
      : (
          await this.prisma.customer.findFirst({
            where: { orgId: user.orgId, isWalkIn: true },
            select: { id: true }
          })
        )?.id;
    if (!customerId) throw new BadRequestException('Walk-in customer is missing');

    const customer = (await this.prisma.customer.findFirst({
      where: { id: customerId, orgId: user.orgId },
      select: { id: true, stateCode: true, phone: true, isWalkIn: true, isBlocked: true, creditDuePaise: true } as any
    })) as any;
    if (!customer) throw new ForbiddenException('Invalid customer');
    if (customer.isBlocked) throw new BadRequestException("Can't process bill");

    const placeOfSupplyStateCode =
      (input.placeOfSupplyStateCode && input.placeOfSupplyStateCode.trim() !== '')
        ? input.placeOfSupplyStateCode
        : (customer.stateCode ?? store.stateCode);

    const taxRegime =
      placeOfSupplyStateCode === store.stateCode
        ? InvoiceTaxRegime.INTRA_STATE
        : InvoiceTaxRegime.INTER_STATE;

    const productIds = [...new Set(input.items.map((i) => i.productId))];
    const products = await this.prisma.product.findMany({
      where: { orgId: user.orgId, id: { in: productIds }, isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        hsnCode: true,
        gstRateBp: true,
        sellingPricePaise: true,
        costPricePaise: true
      }
    });
    if (products.length !== productIds.length) throw new BadRequestException('Invalid product in items');
    const productById = new Map(products.map((p) => [p.id, p]));

    const invoiceDate = new Date();
    const financialYear = financialYearString(invoiceDate);

    const prefix = `${store.code}/${financialYear}/`;

    const paymentAmountPaise = rupeesToPaise(input.payment.amountRupees);
    if (paymentAmountPaise < 0n) throw new BadRequestException('Invalid payment amount');

    return this.prisma.$transaction(async (tx) => {
      const baseSeries = await tx.invoiceSeries.upsert({
        where: { storeId_financialYear: { storeId: store.id, financialYear } },
        create: {
          orgId: user.orgId,
          storeId: store.id,
          financialYear,
          prefix,
          nextNumber: 1
        },
        update: {}
      });

      const updatedSeries = await tx.invoiceSeries.update({
        where: { id: baseSeries.id },
        data: { nextNumber: { increment: 1 } },
        select: { nextNumber: true, prefix: true }
      });

      const seq = updatedSeries.nextNumber - 1;
      const invoiceNo = `${updatedSeries.prefix}${String(seq).padStart(6, '0')}`;

      const stockMove = await tx.stockMove.create({
        data: {
          orgId: user.orgId,
          storeId: store.id,
          fromWarehouseId: warehouse.id,
          moveType: StockMoveType.SALE,
          sourceRef: invoiceNo
        },
        select: { id: true }
      });

      let subtotalPaise = 0n;
      let discountTotalPaise = 0n;
      let cgstTotalPaise = 0n;
      let sgstTotalPaise = 0n;
      let igstTotalPaise = 0n;

      const lineCreates: Array<Prisma.SalesInvoiceLineCreateManyInput> = [];
      let lineNo = 1;

      const pre = input.items.map((item) => {
        const p = productById.get(item.productId)!;
        const qtyMilli = qtyToMilli(item.qty);
        const unitPricePaise =
          item.unitPriceRupees !== undefined ? rupeesToPaise(item.unitPriceRupees) : p.sellingPricePaise;
        if (unitPricePaise < 0n) throw new BadRequestException('Invalid unit price');

        const basePaise = mulPaiseByQtyMilli(unitPricePaise, qtyMilli);
        const discountPaise = item.discountRupees !== undefined ? rupeesToPaise(item.discountRupees) : 0n;
        if (discountPaise < 0n || discountPaise > basePaise) throw new BadRequestException('Invalid discount');
        const taxableBeforeLoyaltyPaise = basePaise - discountPaise;
        return { item, p, qtyMilli, unitPricePaise, basePaise, discountPaise, taxableBeforeLoyaltyPaise };
      });

      let loyaltyRedeemPoints = input.loyaltyRedeemPoints ?? 0;
      if (loyaltyRedeemPoints < 0) loyaltyRedeemPoints = 0;

      if (loyaltyRedeemPoints > 0) {
        if (!requestedCustomerId) throw new BadRequestException('Select a customer to redeem loyalty points');
        if (!customer.phone || !customer.phone.trim()) throw new BadRequestException('Customer phone required for loyalty redemption');

        const agg = await tx.loyaltyLedger.aggregate({
          where: { orgId: user.orgId, customerId: customer.id },
          _sum: { pointsDelta: true }
        });
        const balance = agg._sum.pointsDelta ?? 0;
        if (balance <= 0) throw new BadRequestException('No loyalty points available');

        const subtotalBeforeLoyaltyPaise = pre.reduce((s, l) => s + l.taxableBeforeLoyaltyPaise, 0n);
        if (subtotalBeforeLoyaltyPaise <= 0n) throw new BadRequestException('Invalid invoice for loyalty redemption');

        const maxBySubtotal = Number(subtotalBeforeLoyaltyPaise / 100n);
        const redeemable = Math.max(0, Math.min(balance, loyaltyRedeemPoints, maxBySubtotal));
        if (redeemable <= 0) throw new BadRequestException('Invalid loyalty points to redeem');
        loyaltyRedeemPoints = redeemable;
      }

      const loyaltyDiscountPaise = BigInt(loyaltyRedeemPoints) * 100n;
      const loyaltyExtraDiscountByLineNo = new Map<number, bigint>();
      if (loyaltyDiscountPaise > 0n) {
        const subtotalBeforeLoyaltyPaise = pre.reduce((s, l) => s + l.taxableBeforeLoyaltyPaise, 0n);
        let remaining = loyaltyDiscountPaise;
        for (let i = 0; i < pre.length; i += 1) {
          const share =
            i === pre.length - 1
              ? remaining
              : (loyaltyDiscountPaise * pre[i].taxableBeforeLoyaltyPaise) / subtotalBeforeLoyaltyPaise;
          const capped = share > pre[i].taxableBeforeLoyaltyPaise ? pre[i].taxableBeforeLoyaltyPaise : share;
          loyaltyExtraDiscountByLineNo.set(i + 1, capped);
          remaining -= capped;
        }
      }

      for (const row of pre) {
        const { item, p, qtyMilli, unitPricePaise, basePaise } = row;
        const loyaltyExtra = loyaltyExtraDiscountByLineNo.get(lineNo) ?? 0n;
        const discountPaise = row.discountPaise + loyaltyExtra;
        if (discountPaise < 0n || discountPaise > basePaise) throw new BadRequestException('Invalid discount');

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

        const taxableValuePaise = basePaise - discountPaise;

        const cgstAmountPaise = cgstRateBp ? mulPaiseByRateBp(taxableValuePaise, cgstRateBp) : 0n;
        const sgstAmountPaise = sgstRateBp ? mulPaiseByRateBp(taxableValuePaise, sgstRateBp) : 0n;
        const igstAmountPaise = igstRateBp ? mulPaiseByRateBp(taxableValuePaise, igstRateBp) : 0n;

        const lineTotalPaise = taxableValuePaise + cgstAmountPaise + sgstAmountPaise + igstAmountPaise;

        subtotalPaise += taxableValuePaise;
        discountTotalPaise += discountPaise;
        cgstTotalPaise += cgstAmountPaise;
        sgstTotalPaise += sgstAmountPaise;
        igstTotalPaise += igstAmountPaise;

        const neededQty = new Prisma.Decimal(item.qty);
        let remaining = neededQty;

        const batches = await tx.inventoryBatch.findMany({
          where: {
            orgId: user.orgId,
            warehouseId: warehouse.id,
            productId: p.id,
            qtyAvailable: { gt: new Prisma.Decimal(0) }
          },
          orderBy: { receivedAt: 'asc' },
          select: { id: true, qtyAvailable: true, unitCostPaise: true }
        });

        for (const b of batches) {
          if (remaining.lte(0)) break;
          const takeQty = Prisma.Decimal.min(b.qtyAvailable, remaining);
          if (takeQty.lte(0)) continue;

          await tx.inventoryBatch.update({
            where: { id: b.id },
            data: { qtyAvailable: { decrement: takeQty } }
          });

          await tx.stockMoveLine.create({
            data: {
              orgId: user.orgId,
              stockMoveId: stockMove.id,
              productId: p.id,
              batchId: b.id,
              qtyDelta: takeQty.mul(-1),
              unitCostPaise: b.unitCostPaise
            }
          });

          remaining = remaining.sub(takeQty);
        }

        if (remaining.gt(0)) {
          await tx.stockMoveLine.create({
            data: {
              orgId: user.orgId,
              stockMoveId: stockMove.id,
              productId: p.id,
            batchId: null,
              qtyDelta: remaining.mul(-1),
              unitCostPaise: p.costPricePaise
            }
          });
        }

        lineCreates.push({
          orgId: user.orgId,
          invoiceId: 'TEMP',
          lineNo,
          productId: p.id,
          productName: p.name,
          hsnCode: p.hsnCode,
          gstRateBp,
          qty: new Prisma.Decimal(item.qty),
          unitPricePaise,
          discountPaise,
          taxableValuePaise,
          cgstRateBp,
          sgstRateBp,
          igstRateBp,
          cgstAmountPaise,
          sgstAmountPaise,
          igstAmountPaise,
          lineTotalPaise
        });

        lineNo += 1;
      }

      const taxTotalPaise = cgstTotalPaise + sgstTotalPaise + igstTotalPaise;
      const grandTotalPaise = subtotalPaise + taxTotalPaise;

      const isCreditSale = !!input.saleOnCredit || input.payment.method === 'CREDIT';
      const requestedCouponCode = input.couponCode?.trim() ? input.couponCode.trim() : '';
      const requestedCustomerCreditApplyPaise =
        input.customerCreditApplyRupees && Number.isFinite(input.customerCreditApplyRupees) && input.customerCreditApplyRupees > 0
          ? rupeesToPaise(input.customerCreditApplyRupees)
          : 0n;
      const creditSettlementPaise =
        input.creditSettlementRupees && Number.isFinite(input.creditSettlementRupees) && input.creditSettlementRupees > 0
          ? rupeesToPaise(input.creditSettlementRupees)
          : 0n;

      if (isCreditSale && !input.customerId) throw new BadRequestException('Credit payment requires a customer');
      if (isCreditSale && customer.isWalkIn) throw new BadRequestException('Credit payment requires a customer');
      if (isCreditSale && (requestedCouponCode || requestedCustomerCreditApplyPaise > 0n)) {
        throw new BadRequestException('Credit payment cannot be combined with coupon/credit');
      }
      if (requestedCouponCode && requestedCustomerCreditApplyPaise > 0n) {
        throw new BadRequestException('Coupon and customer credit cannot be used together');
      }
      let storeCreditAppliedPaise = 0n;
      if (requestedCouponCode) {
        const coupon = await tx.coupon.findFirst({
          where: { orgId: user.orgId, code: requestedCouponCode.toUpperCase() },
          select: { id: true, amountPaise: true, usesRemaining: true, validFrom: true, validTo: true, isActive: true }
        });
        if (!coupon || !coupon.isActive) throw new BadRequestException('Invalid coupon');
        if (coupon.usesRemaining <= 0) throw new BadRequestException('Coupon fully used');
        const now = new Date();
        if (coupon.validFrom.getTime() > now.getTime()) throw new BadRequestException('Coupon not active yet');
        if (coupon.validTo && coupon.validTo.getTime() < now.getTime()) throw new BadRequestException('Coupon expired');
        storeCreditAppliedPaise = coupon.amountPaise > grandTotalPaise ? grandTotalPaise : coupon.amountPaise;
      } else if (requestedCustomerCreditApplyPaise > 0n) {
        const customerForCredit = await tx.customer.findFirst({
          where: { id: customer.id, orgId: user.orgId },
          select: { id: true, creditBalancePaise: true, isBlocked: true }
        });
        if (!customerForCredit) throw new BadRequestException('Invalid customer');
        if (customerForCredit.isBlocked) throw new BadRequestException("Can't process bill");
        if (customerForCredit.creditBalancePaise <= 0n) throw new BadRequestException('No customer credit available');
        const apply = requestedCustomerCreditApplyPaise > grandTotalPaise ? grandTotalPaise : requestedCustomerCreditApplyPaise;
        if (apply > customerForCredit.creditBalancePaise) throw new BadRequestException('Insufficient customer credit');
        storeCreditAppliedPaise = apply;
      }

      const payablePaise = grandTotalPaise - storeCreditAppliedPaise;
      if (payablePaise < 0n) throw new BadRequestException('Invalid coupon amount');
      if (input.payment.method === 'CREDIT') {
        if (!isCreditSale) throw new BadRequestException('Invalid payment');
        if (creditSettlementPaise > 0n) throw new BadRequestException('Credit settlement requires cash/upi');
        if (paymentAmountPaise !== 0n) throw new BadRequestException('Payment amount must be 0 for credit payment');
      } else {
        const expectedCollectPaise = isCreditSale ? creditSettlementPaise : payablePaise + creditSettlementPaise;
        if (expectedCollectPaise === 0n && paymentAmountPaise !== 0n) throw new BadRequestException('Payment amount must be 0');
        if (expectedCollectPaise > 0n && paymentAmountPaise !== expectedCollectPaise) throw new BadRequestException('Payment amount mismatch');
        if (creditSettlementPaise > 0n && input.payment.method === 'DEBIT_CARD') throw new BadRequestException('Credit settlement supports only cash/upi');
      }
      if (creditSettlementPaise > 0n) {
        if (!input.customerId || customer.isWalkIn) throw new BadRequestException('Credit settlement requires a customer');
        if (creditSettlementPaise > (customer.creditDuePaise ?? 0n)) throw new BadRequestException('Insufficient credit due');
      }

      const invoice = await tx.salesInvoice.create({
        data: {
          orgId: user.orgId,
          storeId: store.id,
          invoiceNo,
          invoiceDate,
          cashierUserId: user.sub,
          customerId: customer.id,
          deliveryAddress: (input.deliveryAddress && input.deliveryAddress.trim() !== '') ? input.deliveryAddress : null,
          deliveryPincode: (input.deliveryPincode && input.deliveryPincode.trim() !== '') ? input.deliveryPincode : null,
          sellerGstin,
          sellerStateCode: store.stateCode,
          placeOfSupplyStateCode,
          taxRegime,
          subtotalPaise,
          discountTotalPaise,
          loyaltyRedeemPoints,
          taxTotalPaise,
          cgstTotalPaise,
          sgstTotalPaise,
          igstTotalPaise,
          grandTotalPaise,
          storeCreditAppliedPaise,
          roundingPaise: 0n,
          status: SalesInvoiceStatus.ISSUED
        },
        select: { id: true, invoiceNo: true, invoiceDate: true, grandTotalPaise: true }
      });

      await tx.salesInvoiceLine.createMany({
        data: lineCreates.map((l) => ({ ...l, invoiceId: invoice.id }))
      });

      const salePaymentPaise = isCreditSale ? 0n : payablePaise;
      if (salePaymentPaise > 0n) {
        await tx.payment.create({
          data: {
            orgId: user.orgId,
            storeId: store.id,
            invoiceId: invoice.id,
            method: input.payment.method as PaymentMethod,
            amountPaise: salePaymentPaise,
            upiRef: input.payment.upiRef
          }
        });
      }
      if (isCreditSale && payablePaise > 0n) {
        await tx.payment.create({
          data: {
            orgId: user.orgId,
            storeId: store.id,
            invoiceId: invoice.id,
            method: 'CREDIT' as any,
            amountPaise: payablePaise
          }
        });
      }

      if (storeCreditAppliedPaise > 0n) {
        await tx.payment.create({
          data: {
            orgId: user.orgId,
            storeId: store.id,
            invoiceId: invoice.id,
            method: PaymentMethod.STORE_CREDIT,
            amountPaise: storeCreditAppliedPaise,
            upiRef: requestedCouponCode ? requestedCouponCode : (requestedCustomerCreditApplyPaise > 0n ? 'CUSTOMER_CREDIT' : undefined)
          }
        });
      }

      await this.accounting.postSaleJournal({
        tx,
        orgId: user.orgId,
        storeId: store.id,
        postedByUserId: user.sub,
        salesInvoiceId: invoice.id,
        invoiceNo,
        invoiceDate,
        paymentMethod: (isCreditSale ? ('CREDIT' as any) : (input.payment.method as any)) as PaymentMethod,
        storeCreditPaise: storeCreditAppliedPaise,
        grandTotalPaise,
        taxableSubtotalPaise: subtotalPaise,
        cgstPaise: cgstTotalPaise,
        sgstPaise: sgstTotalPaise,
        igstPaise: igstTotalPaise,
        stockMoveId: stockMove.id
      });

      if (isCreditSale && payablePaise > 0n) {
        await tx.customer.update({
          where: { id: customer.id },
          data: { creditDuePaise: { increment: payablePaise } } as any
        });
      }

      if (creditSettlementPaise > 0n) {
        await tx.customerCreditSettlement.create({
          data: {
            orgId: user.orgId,
            storeId: store.id,
            customerId: customer.id,
            salesInvoiceId: invoice.id,
            amountPaise: creditSettlementPaise,
            method: input.payment.method as any,
            upiRef: input.payment.method === 'UPI' ? (input.payment.upiRef || null) : null,
            createdByUserId: user.sub
          } as any
        });
        await tx.customer.update({
          where: { id: customer.id },
          data: { creditDuePaise: { decrement: creditSettlementPaise } } as any
        });
        await this.accounting.postCustomerCreditSettlementJournal({
          tx,
          orgId: user.orgId,
          storeId: store.id,
          postedByUserId: user.sub,
          entryDate: invoiceDate,
          referenceNo: invoiceNo,
          paymentMethod: input.payment.method as any,
          amountPaise: creditSettlementPaise
        });
      }


      if (storeCreditAppliedPaise > 0n && requestedCouponCode) {
        await this.coupons.redeemCouponInTx(tx, {
          orgId: user.orgId,
          storeId: store.id,
          invoiceId: invoice.id,
          redeemedByUserId: user.sub,
          codeInput: requestedCouponCode,
          applyPaise: storeCreditAppliedPaise
        });
      }

      if (storeCreditAppliedPaise > 0n && requestedCustomerCreditApplyPaise > 0n) {
        await tx.customerCreditUse.create({
          data: {
            orgId: user.orgId,
            storeId: store.id,
            invoiceId: invoice.id,
            customerId: customer.id,
            amountPaise: storeCreditAppliedPaise,
            usedByUserId: user.sub
          }
        });
        await tx.customer.update({
          where: { id: customer.id },
          data: { creditBalancePaise: { decrement: storeCreditAppliedPaise } }
        });
      }

      if (customer.phone && customer.phone.trim()) {
        if (loyaltyRedeemPoints > 0) {
          const existingRedemption = await tx.loyaltyLedger.findFirst({
            where: {
              orgId: user.orgId,
              customerId: customer.id,
              sourceType: 'REDEMPTION',
              sourceId: invoice.id
            },
            select: { id: true }
          });
          if (!existingRedemption) {
            await tx.loyaltyLedger.create({
              data: {
                orgId: user.orgId,
                customerId: customer.id,
                sourceType: 'REDEMPTION',
                sourceId: invoice.id,
                pointsDelta: -loyaltyRedeemPoints
              }
            });
          }
        }

        const pointsEarned = Number(grandTotalPaise / 10000n);
        if (pointsEarned > 0) {
          const existing = await tx.loyaltyLedger.findFirst({
            where: {
              orgId: user.orgId,
              customerId: customer.id,
              sourceType: 'SALE',
              sourceId: invoice.id
            },
            select: { id: true }
          });
          if (!existing) {
            await tx.loyaltyLedger.create({
              data: {
                orgId: user.orgId,
                customerId: customer.id,
                sourceType: 'SALE',
                sourceId: invoice.id,
                pointsDelta: pointsEarned
              }
            });
          }
        }
      }

      const existingFeedback = await tx.feedbackLink.findFirst({
        where: { orgId: user.orgId, invoiceId: invoice.id },
        select: { id: true }
      });
      if (!existingFeedback) {
        await tx.feedbackLink.create({
          data: {
            orgId: user.orgId,
            invoiceId: invoice.id,
            token: randomBytes(24).toString('hex'),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
          }
        });
      }

      if ((input as any).stitchingOrderId) {
        const stitchingOrderId = (input as any).stitchingOrderId as string;
        const st = await (tx as any).stitchingOrder.findFirst({
          where: { id: stitchingOrderId, orgId: user.orgId },
          select: { id: true, erpInvoiceId: true, customerProfile: { select: { erpCustomerId: true } } }
        });
        if (!st) throw new BadRequestException('Invalid stitchingOrderId');
        if (st.erpInvoiceId) throw new BadRequestException('Stitching order already billed');

        const invoiceCustomerId = customer?.id ?? null;
        const stitchedCustomerId = st.customerProfile?.erpCustomerId ?? null;
        if (invoiceCustomerId && stitchedCustomerId && invoiceCustomerId !== stitchedCustomerId) {
          throw new BadRequestException('Stitching order customer does not match invoice customer');
        }

        let customerProfileId: string | null = null;
        if (invoiceCustomerId) {
          const profile = await (tx as any).stitchingCustomerProfile.upsert({
            where: { orgId_erpCustomerId: { orgId: user.orgId, erpCustomerId: invoiceCustomerId } },
            create: { orgId: user.orgId, erpCustomerId: invoiceCustomerId },
            update: {},
            select: { id: true }
          });
          customerProfileId = profile.id;
        }

        await (tx as any).stitchingOrder.update({
          where: { id: stitchingOrderId },
          data: { erpInvoiceId: invoice.id, ...(customerProfileId ? { customerProfileId } : {}) }
        });
      }

      const createdLines = await tx.salesInvoiceLine.findMany({
        where: { invoiceId: invoice.id },
        orderBy: { lineNo: 'asc' }
      });

      return { invoice, lines: createdLines };
    });
  }

  async lookupInvoiceForReturn(user: { sub: string; orgId: string; storeId?: string }, invoiceNo: string) {
    if (!user.storeId) throw new ForbiddenException('User is not assigned to a store');
    const inv = await this.prisma.salesInvoice.findFirst({
      where: { orgId: user.orgId, storeId: user.storeId, invoiceNo, status: SalesInvoiceStatus.ISSUED },
      include: {
        customer: { select: { id: true, fullName: true, phone: true, isWalkIn: true } },
        lines: { orderBy: { lineNo: 'asc' } }
      }
    });
    if (!inv) throw new BadRequestException('Invoice not found');

    const returned = await this.prisma.salesReturnLine.findMany({
      where: { orgId: user.orgId, invoiceLine: { invoiceId: inv.id } },
      select: { salesInvoiceLineId: true, qty: true }
    });

    const returnedMilliByLineId = new Map<string, bigint>();
    for (const r of returned) {
      const m = qtyToMilli(Number(r.qty.toString()));
      returnedMilliByLineId.set(r.salesInvoiceLineId, (returnedMilliByLineId.get(r.salesInvoiceLineId) ?? 0n) + m);
    }

    const lines = inv.lines.map((l) => {
      const soldMilli = qtyToMilli(Number(l.qty.toString()));
      const returnedMilli = returnedMilliByLineId.get(l.id) ?? 0n;
      const remainingMilli = soldMilli - returnedMilli;
      const remaining = remainingMilli > 0n ? (Number(remainingMilli) / 1000).toFixed(3) : '0.000';
      return {
        id: l.id,
        lineNo: l.lineNo,
        productId: l.productId,
        productName: l.productName,
        hsnCode: l.hsnCode,
        gstRateBp: l.gstRateBp,
        qty: l.qty.toString(),
        returnableQty: remaining,
        unitPricePaise: l.unitPricePaise.toString(),
        discountPaise: l.discountPaise.toString(),
        taxableValuePaise: l.taxableValuePaise.toString(),
        cgstAmountPaise: l.cgstAmountPaise.toString(),
        sgstAmountPaise: l.sgstAmountPaise.toString(),
        igstAmountPaise: l.igstAmountPaise.toString(),
        lineTotalPaise: l.lineTotalPaise.toString()
      };
    });

    return {
      invoice: {
        id: inv.id,
        invoiceNo: inv.invoiceNo,
        invoiceDate: inv.invoiceDate.toISOString(),
        customer: inv.customer,
        grandTotalPaise: inv.grandTotalPaise.toString()
      },
      lines
    };
  }

  async createSalesReturn(
    user: { sub: string; orgId: string; storeId?: string },
    input: { invoiceNo: string; storeWarehouseId: string; lines: Array<{ salesInvoiceLineId: string; qty: number }> }
  ) {
    if (!user.storeId) throw new ForbiddenException('User is not assigned to a store');
    await this.accounting.setupSystemAccounts(user.orgId);

    const invoice = await this.prisma.salesInvoice.findFirst({
      where: { orgId: user.orgId, storeId: user.storeId, invoiceNo: input.invoiceNo, status: SalesInvoiceStatus.ISSUED },
      include: {
        customer: { select: { id: true, fullName: true, phone: true, isWalkIn: true } },
        lines: { orderBy: { lineNo: 'asc' } }
      }
    });
    if (!invoice) throw new BadRequestException('Invoice not found');

    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: input.storeWarehouseId, orgId: user.orgId, storeId: user.storeId, isActive: true },
      select: { id: true }
    });
    if (!warehouse) throw new BadRequestException('Invalid warehouse');

    const requested = input.lines.filter((l) => Number(l.qty) > 0);
    if (requested.length === 0) throw new BadRequestException('No return lines selected');

    const returned = await this.prisma.salesReturnLine.findMany({
      where: { orgId: user.orgId, invoiceLine: { invoiceId: invoice.id } },
      select: { salesInvoiceLineId: true, qty: true }
    });

    const returnedMilliByLineId = new Map<string, bigint>();
    for (const r of returned) {
      const m = qtyToMilli(Number(r.qty.toString()));
      returnedMilliByLineId.set(r.salesInvoiceLineId, (returnedMilliByLineId.get(r.salesInvoiceLineId) ?? 0n) + m);
    }

    const invoiceLineById = new Map(invoice.lines.map((l) => [l.id, l]));

    function prorate(paise: bigint, returnMilli: bigint, soldMilli: bigint) {
      if (soldMilli <= 0n) throw new BadRequestException('Invalid invoice qty');
      const n = paise * returnMilli;
      return (n + soldMilli / 2n) / soldMilli;
    }

    const now = new Date();
    const returnLines: Array<{
      salesInvoiceLineId: string;
      productId: string;
      productName: string;
      hsnCode: string;
      gstRateBp: number;
      qty: Prisma.Decimal;
      taxableValuePaise: bigint;
      cgstAmountPaise: bigint;
      sgstAmountPaise: bigint;
      igstAmountPaise: bigint;
      lineTotalPaise: bigint;
    }> = [];

    let taxableSubtotalPaise = 0n;
    let cgstPaise = 0n;
    let sgstPaise = 0n;
    let igstPaise = 0n;
    let totalPaise = 0n;

    for (const r of requested) {
      const line = invoiceLineById.get(r.salesInvoiceLineId);
      if (!line) throw new BadRequestException('Invalid invoice line');
      const soldMilli = qtyToMilli(Number(line.qty.toString()));
      const alreadyReturnedMilli = returnedMilliByLineId.get(line.id) ?? 0n;
      const remainingMilli = soldMilli - alreadyReturnedMilli;
      const returnMilli = qtyToMilli(Number(r.qty));
      if (returnMilli <= 0n) throw new BadRequestException('Invalid return quantity');
      if (returnMilli > remainingMilli) throw new BadRequestException('Return quantity exceeds available');

      const taxable = prorate(line.taxableValuePaise, returnMilli, soldMilli);
      const cgst = prorate(line.cgstAmountPaise, returnMilli, soldMilli);
      const sgst = prorate(line.sgstAmountPaise, returnMilli, soldMilli);
      const igst = prorate(line.igstAmountPaise, returnMilli, soldMilli);
      const total = prorate(line.lineTotalPaise, returnMilli, soldMilli);

      taxableSubtotalPaise += taxable;
      cgstPaise += cgst;
      sgstPaise += sgst;
      igstPaise += igst;
      totalPaise += total;

      returnLines.push({
        salesInvoiceLineId: line.id,
        productId: line.productId,
        productName: line.productName,
        hsnCode: line.hsnCode,
        gstRateBp: line.gstRateBp,
        qty: new Prisma.Decimal(Number(r.qty)),
        taxableValuePaise: taxable,
        cgstAmountPaise: cgst,
        sgstAmountPaise: sgst,
        igstAmountPaise: igst,
        lineTotalPaise: total
      });
    }

    const customerHasDetails = !invoice.customer.isWalkIn && !!(invoice.customer.phone && invoice.customer.phone.trim());
    const mode = customerHasDetails ? ReturnCreditMode.LOYALTY : ReturnCreditMode.COUPON;

    const pointsCredited = mode === ReturnCreditMode.LOYALTY ? Number(totalPaise / 100n) : 0;
    if (pointsCredited > 2_000_000_000) throw new BadRequestException('Return amount too large');

    return this.prisma.$transaction(async (tx) => {
      let couponId: string | null = null;
      let couponCode: string | null = null;

      if (mode === ReturnCreditMode.COUPON) {
        const code = `RET-${randomBytes(4).toString('hex').toUpperCase()}`;
        const validTo = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
        const coupon = await tx.coupon.create({
          data: {
            orgId: user.orgId,
            code,
            title: `Return ${invoice.invoiceNo}`,
            amountPaise: totalPaise,
            usesTotal: 1,
            usesRemaining: 1,
            validFrom: now,
            validTo,
            isActive: true,
            createdByUserId: user.sub
          },
          select: { id: true, code: true }
        });
        couponId = coupon.id;
        couponCode = coupon.code;
      }

      const ret = await tx.salesReturn.create({
        data: {
          orgId: user.orgId,
          storeId: user.storeId!,
          salesInvoiceId: invoice.id,
          invoiceNo: invoice.invoiceNo,
          customerId: invoice.customer.id,
          processedByUserId: user.sub,
          mode,
          amountPaise: totalPaise,
          pointsCredited,
          couponId: couponId ?? undefined
        },
        select: { id: true }
      });

      await tx.salesReturnLine.createMany({
        data: returnLines.map((l) => ({
          orgId: user.orgId,
          salesReturnId: ret.id,
          salesInvoiceLineId: l.salesInvoiceLineId,
          productId: l.productId,
          productName: l.productName,
          hsnCode: l.hsnCode,
          gstRateBp: l.gstRateBp,
          qty: l.qty,
          taxableValuePaise: l.taxableValuePaise,
          cgstAmountPaise: l.cgstAmountPaise,
          sgstAmountPaise: l.sgstAmountPaise,
          igstAmountPaise: l.igstAmountPaise,
          lineTotalPaise: l.lineTotalPaise
        }))
      });

      if (mode === ReturnCreditMode.LOYALTY && pointsCredited > 0) {
        await tx.loyaltyLedger.create({
          data: {
            orgId: user.orgId,
            customerId: invoice.customer.id,
            sourceType: LoyaltySourceType.RETURN,
            sourceId: ret.id,
            pointsDelta: pointsCredited
          }
        });
      }

      const stockMove = await tx.stockMove.create({
        data: {
          orgId: user.orgId,
          storeId: user.storeId!,
          toWarehouseId: warehouse.id,
          moveType: StockMoveType.RETURN,
          sourceRef: invoice.invoiceNo
        },
        select: { id: true }
      });

      const productIds = [...new Set(returnLines.map((l) => l.productId))];
      const products = await tx.product.findMany({
        where: { orgId: user.orgId, id: { in: productIds } },
        select: { id: true, costPricePaise: true }
      });
      const costByProductId = new Map(products.map((p) => [p.id, p.costPricePaise]));

      const ts = Date.now();
      for (const l of returnLines) {
        const unitCostPaise = costByProductId.get(l.productId) ?? 0n;
        const batch = await tx.inventoryBatch.create({
          data: {
            orgId: user.orgId,
            warehouseId: warehouse.id,
            productId: l.productId,
            batchNo: `RETURN-${invoice.invoiceNo.replaceAll('/', '-')}-${ts}-${l.productId.slice(0, 6)}`,
            expiryDate: null,
            unitCostPaise,
            qtyReceived: l.qty,
            qtyAvailable: l.qty,
            receivedAt: now
          },
          select: { id: true }
        });

        await tx.stockMoveLine.create({
          data: {
            orgId: user.orgId,
            stockMoveId: stockMove.id,
            productId: l.productId,
            batchId: batch.id,
            qtyDelta: l.qty,
            unitCostPaise
          }
        });
      }

      await this.accounting.postReturnJournal({
        tx,
        orgId: user.orgId,
        storeId: user.storeId!,
        postedByUserId: user.sub,
        invoiceNo: invoice.invoiceNo,
        entryDate: now,
        storeCreditPaise: totalPaise,
        taxableSubtotalPaise,
        cgstPaise,
        sgstPaise,
        igstPaise
      });

      return {
        salesReturn: {
          id: ret.id,
          invoiceNo: invoice.invoiceNo,
          mode,
          amountPaise: totalPaise.toString(),
          pointsCredited,
          couponCode
        }
      };
    });
  }

  async listReturns(orgId: string, storeId?: string, q?: string) {
    const query = q?.trim();
    return this.prisma.salesReturn.findMany({
      where: {
        orgId,
        ...(storeId ? { storeId } : {}),
        ...(query ? { invoiceNo: { contains: query, mode: 'insensitive' } } : {})
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        invoiceNo: true,
        mode: true,
        amountPaise: true,
        pointsCredited: true,
        createdAt: true,
        store: { select: { code: true, name: true } },
        processedBy: { select: { fullName: true } },
        customer: { select: { fullName: true, phone: true, isWalkIn: true } },
        coupon: { select: { code: true } }
      }
    });
  }

  async createInvoiceShareLink(user: { sub: string; orgId: string; storeId?: string; role: string }, invoiceId: string) {
    const invoice = await this.prisma.salesInvoice.findFirst({
      where: { id: invoiceId, orgId: user.orgId, status: SalesInvoiceStatus.ISSUED },
      select: { id: true, storeId: true }
    });
    if (!invoice) throw new ForbiddenException('Invalid invoice');
    if (user.storeId && invoice.storeId !== user.storeId && user.role !== 'ADMIN') {
      throw new ForbiddenException('Invoice not accessible');
    }

    const token = randomBytes(24).toString('hex');
    const created = await this.prisma.invoiceShareLink.create({
      data: { orgId: user.orgId, invoiceId: invoice.id, token },
      select: { token: true }
    });
    return created;
  }

  async createReturnShareLink(user: { sub: string; orgId: string; storeId?: string; role: string }, salesReturnId: string) {
    const ret = await this.prisma.salesReturn.findFirst({
      where: { id: salesReturnId, orgId: user.orgId },
      select: { id: true, storeId: true }
    });
    if (!ret) throw new ForbiddenException('Invalid return');
    if (user.storeId && ret.storeId !== user.storeId && user.role !== 'ADMIN') {
      throw new ForbiddenException('Return not accessible');
    }

    const token = randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const created = await this.prisma.salesReturnShareLink.create({
      data: { orgId: user.orgId, salesReturnId: ret.id, token, expiresAt },
      select: { token: true }
    });
    return created;
  }

  async getInvoiceFeedbackLink(orgId: string, invoiceId: string) {
    return this.prisma.feedbackLink.findFirst({
      where: { orgId, invoiceId },
      select: { token: true, expiresAt: true }
    });
  }

  async createCustomerCreditReceipt(
    user: { sub: string; orgId: string; storeId?: string; role: string },
    input: {
      customerName: string;
      customerPhone: string;
      gstin?: string;
      isBusiness?: boolean;
      stateCode?: string;
      address?: string;
      pincode?: string;
      amountRupees: number;
      payment: { method: 'CASH' | 'UPI' | 'DEBIT_CARD'; upiRef?: string };
    }
  ) {
    if (!user.storeId) throw new ForbiddenException('User is not assigned to a store');
    await this.accounting.setupSystemAccounts(user.orgId);

    const store = await this.prisma.store.findFirst({
      where: { id: user.storeId, orgId: user.orgId },
      select: { id: true, code: true }
    });
    if (!store) throw new ForbiddenException('Invalid store');

    const amountPaise = rupeesToPaise(input.amountRupees);
    if (amountPaise <= 0n) throw new BadRequestException('Invalid amount');

    return this.prisma.$transaction(async (tx) => {
      const phone = input.customerPhone.trim();
      const normalizedName = input.customerName.trim();
      const normalizedGstin = input.gstin?.trim() ? input.gstin.trim().toUpperCase() : null;
      const normalizedState = input.stateCode?.trim() ? input.stateCode.trim() : null;
      const normalizedAddress = input.address?.trim() ? input.address.trim() : null;
      const normalizedPincode = input.pincode?.trim() ? input.pincode.trim() : null;
      const normalizedIsBusiness = input.isBusiness === true;

      const existing = await tx.customer.findFirst({
        where: { orgId: user.orgId, phone, isWalkIn: false },
        select: { id: true, isBlocked: true }
      });
      if (existing?.isBlocked) throw new BadRequestException("Can't process bill");

      const customer = existing
        ? await tx.customer.update({
            where: { id: existing.id },
            data: {
              fullName: normalizedName,
              ...(normalizedGstin !== null ? { gstin: normalizedGstin } : {}),
              ...(input.gstin !== undefined && normalizedGstin === null ? { gstin: null } : {}),
              ...(input.stateCode !== undefined ? { stateCode: normalizedState } : {}),
              ...(input.address !== undefined ? { address: normalizedAddress } : {}),
              ...(input.pincode !== undefined ? { pincode: normalizedPincode } : {}),
              ...(input.isBusiness !== undefined ? { isBusiness: normalizedIsBusiness } : {})
            } as any,
            select: { id: true }
          })
        : await tx.customer.create({
            data: {
              orgId: user.orgId,
              fullName: normalizedName,
              phone,
              isWalkIn: false,
              gstin: normalizedGstin,
              isBusiness: normalizedIsBusiness,
              stateCode: normalizedState,
              address: normalizedAddress,
              pincode: normalizedPincode
            } as any,
            select: { id: true }
          });

      const receiptNo = `CRD/${store.code}/${Date.now().toString().slice(-6)}-${randomBytes(2).toString('hex').toUpperCase()}`;
      const receiptDate = new Date();

      const receipt = await tx.customerCreditReceipt.create({
        data: {
          orgId: user.orgId,
          storeId: store.id,
          receiptNo,
          receiptDate,
          customerId: customer.id,
          amountPaise,
          method: input.payment.method as any,
          upiRef: input.payment.upiRef?.trim() || null,
          createdByUserId: user.sub
        },
        select: { id: true, receiptNo: true, receiptDate: true, amountPaise: true }
      });

      await tx.customer.update({
        where: { id: customer.id },
        data: { creditBalancePaise: { increment: amountPaise } } as any
      });

      await this.accounting.postCustomerCreditJournal({
        tx,
        orgId: user.orgId,
        storeId: store.id,
        postedByUserId: user.sub,
        entryDate: receiptDate,
        receiptNo,
        paymentMethod: input.payment.method as any,
        amountPaise
      });

      return { receipt: { id: receipt.id, receiptNo: receipt.receiptNo, receiptDate: receipt.receiptDate, amountPaise: receipt.amountPaise.toString() } };
    });
  }

  async createCustomerCreditSettlement(
    user: { sub: string; orgId: string; storeId?: string; role: string },
    input: { customerId: string; amountRupees: number; payment: { method: 'CASH' | 'UPI'; upiRef?: string } }
  ) {
    if (!user.storeId) throw new ForbiddenException('User is not assigned to a store');
    await this.accounting.setupSystemAccounts(user.orgId);

    const store = await this.prisma.store.findFirst({
      where: { id: user.storeId, orgId: user.orgId },
      select: { id: true, code: true }
    });
    if (!store) throw new ForbiddenException('Invalid store');

    const amountPaise = rupeesToPaise(input.amountRupees);
    if (amountPaise <= 0n) throw new BadRequestException('Invalid amount');

    return this.prisma.$transaction(async (tx) => {
      const customer = (await tx.customer.findFirst({
        where: { id: input.customerId, orgId: user.orgId, isWalkIn: false },
        select: { id: true, isBlocked: true, creditDuePaise: true }
      })) as any;
      if (!customer) throw new BadRequestException('Invalid customer');
      if (customer.isBlocked) throw new BadRequestException("Can't process bill");
      if ((customer.creditDuePaise ?? 0n) <= 0n) throw new BadRequestException('No credit due');
      if (amountPaise > (customer.creditDuePaise ?? 0n)) throw new BadRequestException('Insufficient credit due');

      const referenceNo = `DUE/${store.code}/${Date.now().toString().slice(-6)}-${randomBytes(2).toString('hex').toUpperCase()}`;
      const entryDate = new Date();

      const settlement = await tx.customerCreditSettlement.create({
        data: {
          orgId: user.orgId,
          storeId: store.id,
          customerId: customer.id,
          salesInvoiceId: null,
          referenceNo,
          amountPaise,
          method: input.payment.method as any,
          upiRef: input.payment.upiRef?.trim() || null,
          createdByUserId: user.sub
        } as any,
        select: { id: true, createdAt: true, amountPaise: true }
      });

      await tx.customer.update({
        where: { id: customer.id },
        data: { creditDuePaise: { decrement: amountPaise } } as any
      });

      await this.accounting.postCustomerCreditSettlementJournal({
        tx,
        orgId: user.orgId,
        storeId: store.id,
        postedByUserId: user.sub,
        entryDate,
        referenceNo,
        paymentMethod: input.payment.method as any,
        amountPaise
      });

      return {
        settlement: {
          id: settlement.id,
          createdAt: settlement.createdAt,
          referenceNo,
          amountPaise: settlement.amountPaise.toString()
        }
      };
    });
  }

  async listCustomerCreditReceipts(orgId: string, q?: string) {
    const query = q?.trim();
    return this.prisma.customerCreditReceipt.findMany({
      where: {
        orgId,
        ...(query
          ? {
              OR: [
                { receiptNo: { contains: query, mode: 'insensitive' } },
                { customer: { fullName: { contains: query, mode: 'insensitive' } } },
                { customer: { phone: { contains: query } } }
              ]
            }
          : {})
      },
      orderBy: { receiptDate: 'desc' },
      take: 100,
      select: {
        id: true,
        receiptNo: true,
        receiptDate: true,
        amountPaise: true,
        method: true,
        upiRef: true,
        store: { select: { code: true, name: true } },
        customer: { select: { fullName: true, phone: true } },
        createdBy: { select: { fullName: true } }
      }
    });
  }

  async listCustomerCreditBalances(orgId: string, q?: string) {
    const query = q?.trim();
    return this.prisma.customer.findMany({
      where: {
        orgId,
        isWalkIn: false,
        creditBalancePaise: { gt: 0n },
        ...(query
          ? {
              OR: [
                { fullName: { contains: query, mode: 'insensitive' } },
                { phone: { contains: query } },
                { gstin: { contains: query, mode: 'insensitive' } }
              ]
            }
          : {})
      } as any,
      orderBy: { updatedAt: 'desc' },
      take: 200,
      select: { id: true, fullName: true, phone: true, gstin: true, creditBalancePaise: true, updatedAt: true } as any
    });
  }

  async listCustomerCreditDues(orgId: string, q?: string) {
    const query = q?.trim();
    return this.prisma.customer.findMany({
      where: {
        orgId,
        isWalkIn: false,
        creditDuePaise: { gt: 0n },
        ...(query
          ? {
              OR: [
                { fullName: { contains: query, mode: 'insensitive' } },
                { phone: { contains: query } },
                { gstin: { contains: query, mode: 'insensitive' } }
              ]
            }
          : {})
      } as any,
      orderBy: { updatedAt: 'desc' },
      take: 200,
      select: { id: true, fullName: true, phone: true, gstin: true, creditDuePaise: true, updatedAt: true } as any
    });
  }

  async listCustomerCreditSettlements(orgId: string, q?: string) {
    const query = q?.trim();
    return this.prisma.customerCreditSettlement.findMany({
      where: {
        orgId,
        ...(query
          ? {
              OR: [
                { customer: { fullName: { contains: query, mode: 'insensitive' } } },
                { customer: { phone: { contains: query } } },
                { salesInvoice: { invoiceNo: { contains: query, mode: 'insensitive' } } }
              ]
            }
          : {})
      } as any,
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        createdAt: true,
        amountPaise: true,
        method: true,
        upiRef: true,
        store: { select: { code: true, name: true } },
        customer: { select: { fullName: true, phone: true } },
        salesInvoice: { select: { invoiceNo: true } },
        createdBy: { select: { fullName: true } }
      } as any
    });
  }

  async createCustomerCreditShareLink(user: { sub: string; orgId: string; storeId?: string; role: string }, receiptId: string) {
    const receipt = await this.prisma.customerCreditReceipt.findFirst({
      where: { id: receiptId, orgId: user.orgId },
      select: { id: true, storeId: true }
    });
    if (!receipt) throw new ForbiddenException('Invalid credit receipt');
    if (user.storeId && receipt.storeId !== user.storeId && user.role !== 'ADMIN') {
      throw new ForbiddenException('Credit receipt not accessible');
    }
    const token = randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    return this.prisma.customerCreditShareLink.create({
      data: { orgId: user.orgId, receiptId: receipt.id, token, expiresAt },
      select: { token: true }
    });
  }

  async listSalesInvoices(orgId: string, storeId: string) {
    return this.prisma.salesInvoice.findMany({
      where: { orgId, storeId },
      orderBy: { invoiceDate: 'desc' },
      take: 50,
      select: {
        id: true,
        invoiceNo: true,
        invoiceDate: true,
        grandTotalPaise: true,
        taxRegime: true,
        status: true
      }
    });
  }

  async getSalesInvoice(orgId: string, storeId: string, id: string) {
    const invoice = await this.prisma.salesInvoice.findFirst({
      where: { id, orgId, storeId },
      include: {
        lines: { orderBy: { lineNo: 'asc' } },
        payments: true
      }
    });
    return invoice;
  }
}
