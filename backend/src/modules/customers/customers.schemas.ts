import { z } from 'zod';

export const createCustomerSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  phone: z.string().trim().regex(/^\d{10}$/).optional(),
  gstin: z.string().trim().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/).optional().or(z.literal('')),
  isBusiness: z.boolean().optional(),
  stateCode: z.string().regex(/^\d{2}$/).optional(),
  address: z.string().trim().min(4).max(250).optional(),
  pincode: z.string().trim().regex(/^\d{6}$/).optional()
});

export const updateCustomerSchema = z.object({
  fullName: z.string().trim().min(2).max(100).optional(),
  phone: z.string().trim().regex(/^\d{10}$/).optional(),
  gstin: z.string().trim().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/).optional().or(z.literal('')),
  isBusiness: z.boolean().optional(),
  stateCode: z.string().regex(/^\d{2}$/).optional(),
  address: z.string().trim().min(4).max(250).optional(),
  pincode: z.string().trim().regex(/^\d{6}$/).optional()
});

export const updateCustomerStitchingSchema = z.object({
  notes: z.string().trim().max(500).optional().or(z.literal(''))
});
