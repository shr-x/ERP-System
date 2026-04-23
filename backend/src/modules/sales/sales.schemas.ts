import { z } from 'zod';

const qtySchema = z
  .union([z.number(), z.string().trim().min(1).transform((v) => Number(v))])
  .refine((v) => Number.isFinite(v) && v > 0, { message: 'Invalid quantity' });

const moneyRupeesSchema = z
  .union([z.number(), z.string().trim().min(1).transform((v) => Number(v))])
  .refine((v) => Number.isFinite(v) && v >= 0, { message: 'Invalid amount' });

const paymentMethodSchema = z.enum(['CASH', 'UPI', 'DEBIT_CARD', 'CREDIT']);
const pointsSchema = z
  .union([z.number(), z.string().trim().min(1).transform((v) => Number(v))])
  .refine((v) => Number.isFinite(v) && Number.isInteger(v) && v >= 0, { message: 'Invalid points' });

const invoiceNoSchema = z.string().trim().min(3).max(50);

export const createSalesInvoiceSchema = z.object({
  storeWarehouseId: z.string().uuid(),
  customerId: z.string().uuid().optional(),
  stitchingOrderId: z.string().uuid().optional(),
  saleOnCredit: z.boolean().optional(),
  placeOfSupplyStateCode: z.string().regex(/^\d{2}$/).optional().or(z.literal('')),
  deliveryAddress: z.string().trim().max(500).optional().or(z.literal('')),
  deliveryPincode: z.string().trim().regex(/^\d{6}$/).optional().or(z.literal('')),
  loyaltyRedeemPoints: pointsSchema.optional(),
  couponCode: z.string().trim().min(1).max(32).optional().or(z.literal('')),
  customerCreditApplyRupees: moneyRupeesSchema.optional(),
  creditSettlementRupees: moneyRupeesSchema.optional(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        qty: qtySchema,
        unitPriceRupees: moneyRupeesSchema.optional(),
        discountRupees: moneyRupeesSchema.optional()
      })
    )
    .min(1),
  payment: z.object({
    method: paymentMethodSchema,
    amountRupees: moneyRupeesSchema,
    upiRef: z.string().trim().optional()
  })
});

export const invoiceLookupSchema = z.object({
  invoiceNo: invoiceNoSchema
});

const returnQtySchema = z
  .union([z.number(), z.string().trim().min(1).transform((v) => Number(v))])
  .refine((v) => Number.isFinite(v) && v > 0, { message: 'Invalid quantity' });

export const createReturnSchema = z.object({
  invoiceNo: invoiceNoSchema,
  storeWarehouseId: z.string().uuid(),
  lines: z
    .array(
      z.object({
        salesInvoiceLineId: z.string().uuid(),
        qty: returnQtySchema
      })
    )
    .min(1)
});

export const listReturnsSchema = z.object({
  storeId: z.string().uuid().optional().or(z.literal('')),
  q: z.string().trim().max(100).optional().or(z.literal(''))
});

export const createCustomerCreditReceiptSchema = z.object({
  customerName: z.string().trim().min(2).max(100),
  customerPhone: z.string().trim().regex(/^\d{10}$/),
  gstin: z.string().trim().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/).optional().or(z.literal('')),
  isBusiness: z.boolean().optional(),
  stateCode: z.string().regex(/^\d{2}$/).optional().or(z.literal('')),
  address: z.string().trim().max(250).optional().or(z.literal('')),
  pincode: z.string().trim().regex(/^\d{6}$/).optional().or(z.literal('')),
  amountRupees: moneyRupeesSchema.refine((v) => v > 0, { message: 'Invalid amount' }),
  payment: z.object({
    method: paymentMethodSchema,
    upiRef: z.string().trim().optional()
  })
});

export const createCustomerCreditSettlementSchema = z.object({
  customerId: z.string().uuid(),
  amountRupees: moneyRupeesSchema.refine((v) => v > 0, { message: 'Invalid amount' }),
  payment: z.object({
    method: z.enum(['CASH', 'UPI']),
    upiRef: z.string().trim().optional()
  })
});

export const listCustomerCreditSchema = z.object({
  q: z.string().trim().max(100).optional().or(z.literal(''))
});

export const listCustomerCreditBalancesSchema = z.object({
  q: z.string().trim().max(100).optional().or(z.literal(''))
});

export const listCustomerCreditDuesSchema = z.object({
  q: z.string().trim().max(100).optional().or(z.literal(''))
});

export const listCustomerCreditSettlementsSchema = z.object({
  q: z.string().trim().max(100).optional().or(z.literal(''))
});
