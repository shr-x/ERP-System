import { z } from 'zod';

export const exportFormatSchema = z.enum(['XLSX', 'PDF', 'JSON']);

export const periodSchema = z.object({
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  storeId: z.string().uuid().optional()
});
