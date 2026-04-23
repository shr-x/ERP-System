import { z } from 'zod';

export const createStoreSchema = z.object({
  code: z.string().trim().min(2),
  name: z.string().min(2),
  address: z.string().min(5),
  stateCode: z.string().regex(/^\d{2}$/)
});

export const createWarehouseSchema = z.object({
  storeId: z.string().uuid(),
  name: z.string().trim().min(2)
});

export const updateStoreSchema = z.object({
  name: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().min(2).optional()
  ),
  phone: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().min(10).max(16).optional()
  ),
  address: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().min(5).optional()
  ),
  gstin: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().min(5).max(20).optional()
  ),
  footerNote: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().max(200).optional()
  )
});
