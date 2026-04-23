import { z } from 'zod';

const qtySchema = z
  .union([z.number(), z.string().trim().min(1).transform((v) => Number(v))])
  .refine((v) => Number.isFinite(v) && v > 0, { message: 'Invalid quantity' });

const moneyRupeesSchema = z
  .union([z.number(), z.string().trim().min(1).transform((v) => Number(v))])
  .refine((v) => Number.isFinite(v) && v >= 0, { message: 'Invalid amount' });

export const receiveStockSchema = z.object({
  warehouseId: z.string().uuid(),
  productId: z.string().uuid(),
  batchNo: z.string().trim().min(1),
  expiryDate: z.string().trim().optional(),
  qty: qtySchema,
  unitCostRupees: moneyRupeesSchema,
  receivedAt: z.string().trim().optional()
});

export const transferStockSchema = z.object({
  fromWarehouseId: z.string().uuid(),
  toWarehouseId: z.string().uuid(),
  productId: z.string().uuid(),
  qty: qtySchema
});

export const restockWarehouseSchema = z.object({
  warehouseId: z.string().uuid(),
  targetQty: z
    .union([z.number(), z.string().trim().min(1).transform((v) => Number(v))])
    .refine((v) => Number.isFinite(v) && v > 0, { message: 'Invalid targetQty' })
});
