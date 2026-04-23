import { z } from 'zod';

export const bootstrapSchema = z.object({
  org: z.object({
    name: z.string().min(2),
    gstin: z.string().trim().min(5),
    legalAddress: z.string().min(5),
    stateCode: z.string().regex(/^\d{2}$/)
  }),
  store: z.object({
    code: z.string().trim().min(2),
    name: z.string().min(2),
    address: z.string().min(5),
    stateCode: z.string().regex(/^\d{2}$/)
  }),
  admin: z.object({
    fullName: z.string().min(2),
    phone: z.string().trim().min(8),
    email: z.string().trim().email().optional(),
    password: z.string().min(8)
  })
});

export const loginSchema = z.object({
  phoneOrEmail: z.string().trim().min(3),
  password: z.string().min(1)
});

export const verifyAdminPasswordSchema = z.object({
  password: z.string().min(1)
});

export const createStaffSchema = z.object({
  fullName: z.string().trim().min(2),
  phone: z.string().trim().min(8),
  email: z.string().trim().email().optional().or(z.literal('')),
  password: z.string().min(8)
});

export const resetStaffPasswordSchema = z.object({
  newPassword: z.string().min(8),
  adminPassword: z.string().min(1)
});

export const deactivateStaffSchema = z.object({
  adminPassword: z.string().min(1)
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8)
});

export const updateMyCredentialsSchema = z.object({
  fullName: z.string().trim().min(2),
  phone: z.string().trim().min(8),
  email: z.string().trim().email().optional().or(z.literal('')),
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).optional().or(z.literal(''))
});
