import { z } from 'zod';
import { createProductSchema, updateProductSchema } from '../products/products.schemas';

const phoneSchema = z.string().trim().regex(/^\d{10}$/);
const gstinSchema = z.string().trim().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/);
const stateCodeSchema = z.string().trim().regex(/^\d{2}$/);
const pincodeSchema = z.string().trim().regex(/^\d{6}$/);

export const portalCreateAdminUserSchema = z.object({
  orgId: z.string().uuid(),
  fullName: z.string().trim().min(2),
  phone: phoneSchema,
  email: z.string().trim().email().optional().or(z.literal('')),
  password: z.string().min(6),
  storeId: z.string().uuid().optional().or(z.literal(''))
});

export const portalCreateProductSchema = createProductSchema.extend({
  posVisible: z.boolean().optional().default(true)
});

export const portalUpdateProductSchema = updateProductSchema.extend({
  posVisible: z.boolean().optional(),
  isPortalManaged: z.boolean().optional()
});

export const portalDirectReceiveSchema = z.object({
  orgId: z.string().uuid(),
  storeId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  productId: z.string().uuid(),
  qty: z.union([z.number(), z.string().trim().min(1).transform((v) => Number(v))]).refine((v) => Number.isFinite(v) && v > 0, {
    message: 'Invalid qty'
  }),
  unitCostRupees: z.union([z.number(), z.string().trim().min(1).transform((v) => Number(v))]).refine((v) => Number.isFinite(v) && v >= 0, {
    message: 'Invalid unit cost'
  }),
  receivedAt: z.string().trim().optional().or(z.literal('')),
  actorAdminUserId: z.string().uuid().optional().or(z.literal(''))
});

export const portalUpdateOrgSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  gstin: gstinSchema.optional().or(z.literal(''))
});

export const portalUpdateUserSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  phone: phoneSchema.optional().or(z.literal('')),
  email: z.string().trim().email().optional().or(z.literal('')),
  role: z.enum(['ADMIN', 'STAFF']).optional(),
  storeId: z.string().uuid().optional().or(z.literal('')),
  isActive: z.boolean().optional()
});

export const portalCreateCategorySchema = z.object({
  name: z.string().trim().min(2).max(80),
  imageUrl: z.string().trim().url().optional().or(z.literal('')),
  posVisible: z.boolean().optional().default(true)
});

export const portalUpdateCategorySchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  imageUrl: z.string().trim().url().optional().or(z.literal('')),
  posVisible: z.boolean().optional()
});

export const portalCreateStitchingCategorySchema = z.object({
  name: z.string().trim().min(2).max(80),
  posVisible: z.boolean().optional().default(true)
});

export const portalUpdateStitchingCategorySchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  posVisible: z.boolean().optional()
});

export const portalCreateCustomerSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  phone: phoneSchema.optional().or(z.literal('')),
  gstin: gstinSchema.optional().or(z.literal('')),
  isBusiness: z.boolean().optional(),
  stateCode: stateCodeSchema.optional().or(z.literal('')),
  address: z.string().trim().min(4).max(250).optional().or(z.literal('')),
  pincode: pincodeSchema.optional().or(z.literal(''))
});

export const portalUpdateCustomerSchema = z.object({
  fullName: z.string().trim().min(2).max(100).optional(),
  phone: phoneSchema.optional().or(z.literal('')),
  gstin: gstinSchema.optional().or(z.literal('')),
  isBusiness: z.boolean().optional(),
  stateCode: stateCodeSchema.optional().or(z.literal('')),
  address: z.string().trim().min(4).max(250).optional().or(z.literal('')),
  pincode: pincodeSchema.optional().or(z.literal('')),
  isBlocked: z.boolean().optional()
});

export const portalCreateSupplierSchema = z.object({
  name: z.string().trim().min(2).max(120),
  gstin: gstinSchema.optional().or(z.literal('')),
  stateCode: stateCodeSchema.optional().or(z.literal(''))
});

export const portalUpdateSupplierSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  gstin: gstinSchema.optional().or(z.literal('')),
  stateCode: stateCodeSchema.optional().or(z.literal(''))
});
