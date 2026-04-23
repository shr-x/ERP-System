import { z } from 'zod';

const qtySchema = z
  .union([z.number(), z.string().trim().min(1).transform((v) => Number(v))])
  .refine((v) => Number.isFinite(v) && v > 0, { message: 'Invalid quantity' });

const moneyRupeesSchema = z
  .union([z.number(), z.string().trim().min(1).transform((v) => Number(v))])
  .refine((v) => Number.isFinite(v) && v >= 0, { message: 'Invalid amount' });

export const createSupplierSchema = z.object({
  name: z.string().trim().min(1),
  gstin: z.string().trim().optional(),
  stateCode: z.string().trim().length(2).optional()
});

export const createPurchaseInvoiceSchema = z.object({
  storeWarehouseId: z.string().uuid(),
  supplierId: z.string().uuid(),
  supplierStateCode: z.string().trim().regex(/^\d{2}$/).optional().or(z.literal('')),
  supplierInvoiceNo: z.string().trim().min(1),
  invoiceDate: z.string().trim().min(1),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        sizeLabel: z.string().trim().max(20).optional().or(z.literal('')),
        batchNo: z.string().trim().min(1),
        expiryDate: z.string().trim().optional(),
        qty: qtySchema,
        unitCostRupees: moneyRupeesSchema
      })
    )
    .min(1)
});
