import { z } from 'zod';

const productCodeSchema = z.string().trim().regex(/^[A-Z0-9]{2,6}-\d{4}(?:-[A-Z0-9]{1,12})?$/);
const hsnSchema = z.string().trim().regex(/^\d{4,8}$/);

const moneyRupeesSchema = z.union([
  z.number(),
  z.string().trim().min(1).transform((v) => Number(v))
]).refine((v) => Number.isFinite(v) && v >= 0, { message: 'Invalid amount' });

const gstPercentSchema = z.union([
  z.number(),
  z.string().trim().min(1).transform((v) => Number(v))
]).refine((v) => Number.isFinite(v) && v >= 0 && v <= 28, { message: 'Invalid GST %' });

export const createProductSchema = z.object({
  code: productCodeSchema,
  name: z.string().trim().min(2),
  sizeLabel: z.string().trim().min(1).max(20).optional().default('NO_SIZE'),
  parentProductId: z.string().uuid().optional().or(z.literal('')),
  hsnCode: hsnSchema,
  gstRatePercent: gstPercentSchema,
  sellingPriceRupees: moneyRupeesSchema,
  costPriceRupees: moneyRupeesSchema.optional(),
  imageUrl: z.string().trim().url().optional(),
  categoryId: z.string().uuid().optional()
});

export const updateProductSchema = z.object({
  name: z.string().trim().min(2).optional(),
  sizeLabel: z.string().trim().min(1).max(20).optional(),
  parentProductId: z.string().uuid().optional().or(z.literal('')),
  hsnCode: hsnSchema.optional(),
  gstRatePercent: gstPercentSchema.optional(),
  sellingPriceRupees: moneyRupeesSchema.optional(),
  costPriceRupees: moneyRupeesSchema.optional(),
  imageUrl: z.string().trim().url().optional().or(z.literal('')),
  categoryId: z.string().uuid().optional().or(z.literal(''))
});
