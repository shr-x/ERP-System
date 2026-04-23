import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

const moneyRupeesSchema = z
  .union([z.number(), z.string().trim().min(1).transform((v) => Number(v))])
  .refine((v) => Number.isFinite(v) && v >= 0, { message: 'Invalid amount' });

export const createCouponSchema = z.object({
  code: z.string().trim().max(32).optional().or(z.literal('')),
  title: z.string().trim().max(100).optional().or(z.literal('')),
  amountRupees: moneyRupeesSchema,
  usesTotal: z.number().int().min(1).max(1000),
  validFrom: z.string().trim().optional().or(z.literal('')),
  validTo: z.string().trim().optional().or(z.literal(''))
});

export const createCouponPipe = new ZodValidationPipe(createCouponSchema);

export const validateCouponQuerySchema = z.object({
  code: z.string().trim().min(1).max(32)
});

export const validateCouponQueryPipe = new ZodValidationPipe(validateCouponQuerySchema);
