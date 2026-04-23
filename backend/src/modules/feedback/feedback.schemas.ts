import { z } from 'zod';

export const submitFeedbackSchema = z.object({
  rating: z
    .union([z.number(), z.string().trim().min(1).transform((v) => Number(v))])
    .refine((v) => Number.isFinite(v) && Number.isInteger(v) && v >= 1 && v <= 5, { message: 'Invalid rating' }),
  comment: z.string().trim().max(500).optional().or(z.literal(''))
});

export const listFeedbackSchema = z.object({
  q: z.string().trim().max(100).optional().or(z.literal(''))
});

