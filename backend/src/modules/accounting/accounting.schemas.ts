import { z } from 'zod';

const moneyRupeesSchema = z
  .union([z.number(), z.string().trim().min(1).transform((v) => Number(v))])
  .refine((v) => Number.isFinite(v) && v >= 0, { message: 'Invalid amount' });

export const profitLossQuerySchema = z.object({
  periodStart: z.string().trim().min(1),
  periodEnd: z.string().trim().min(1),
  format: z.enum(['XLSX', 'JSON']).optional()
});

export const createManualJournalEntrySchema = z.object({
  entryDate: z.string().trim().min(1),
  narration: z.string().trim().min(1),
  lines: z
    .array(
      z.object({
        accountId: z.string().uuid(),
        debitRupees: moneyRupeesSchema.optional(),
        creditRupees: moneyRupeesSchema.optional()
      })
    )
    .min(2)
});
