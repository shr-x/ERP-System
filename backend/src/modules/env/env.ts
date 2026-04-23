import * as dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(4000),
  JWT_ACCESS_SECRET: z.string().min(16),
  LOG_LEVEL: z.string().min(1).optional(),
  PUPPETEER_EXECUTABLE_PATH: z.string().min(1).optional(),
  UPI_VPA: z.string().min(3).optional(),
  UPI_PAYEE_NAME: z.string().min(2).optional(),
  STITCHING_SERVICE_PRODUCT_CODE: z.string().min(2).optional(),
  STITCHING_TAILOR_EXPENSE_ACCOUNT_CODE: z.string().min(2).optional(),
  PORTAL_ACCESS_KEY: z.string().min(8).optional()
});

export const env = envSchema.parse(process.env);
