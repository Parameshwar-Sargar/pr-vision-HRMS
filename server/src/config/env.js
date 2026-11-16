import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Explicitly load server/.env regardless of current working directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config(); // fallback for root .env if present

const envSchema = z.object({
  PORT: z.string().default('5000').transform((val) => parseInt(val, 10)),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  MONGODB_DB_NAME: z.string().default('pr_vision_hrms'),
  DB_MIN_POOL_SIZE: z.string().default('5').transform((val) => parseInt(val, 10)),
  DB_MAX_POOL_SIZE: z.string().default('20').transform((val) => parseInt(val, 10)),
  DB_SERVER_SELECTION_TIMEOUT_MS: z.string().default('25000').transform((val) => parseInt(val, 10)),
  DB_CONNECT_TIMEOUT_MS: z.string().default('25000').transform((val) => parseInt(val, 10)),
  DB_SOCKET_TIMEOUT_MS: z.string().default('45000').transform((val) => parseInt(val, 10)),
  DB_MAX_IDLE_TIME_MS: z.string().default('60000').transform((val) => parseInt(val, 10)),
  DB_RECONNECT_INTERVAL_MS: z.string().default('10000').transform((val) => parseInt(val, 10)),
  DB_MAX_RECONNECT_ATTEMPTS: z.string().default('12').transform((val) => parseInt(val, 10)),
  SYNC_INDEXES: z
    .string()
    .optional()
    .default('false')
    .transform((val) => val === 'true'),
  JWT_ACCESS_SECRET: z.string().default('pr_vision_hrms_super_secure_access_secret_2026_jwt'),
  JWT_REFRESH_SECRET: z.string().default('pr_vision_hrms_super_secure_refresh_secret_2026_jwt'),
  JWT_SECRET: z.string().optional(),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  COOKIE_SECRET: z.string().default('pr_vision_cookie_secret_key_hrms_2026'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  CLIENT_URL: z.string().optional().default('http://localhost:5173'),
  RATE_LIMIT_WINDOW_MS: z.string().default('900000').transform((val) => parseInt(val, 10)),
  RATE_LIMIT_MAX: z.string().default('1000').transform((val) => parseInt(val, 10)),
  DEV_ADMIN_SEED_ENABLED: z
    .string()
    .optional()
    .default('true')
    .transform((val) => val === 'true'),
  DEV_ADMIN_EMAIL: z.string().email().optional().default('admin@prvision.com'),
  DEV_ADMIN_PASSWORD: z.string().optional().default('Password@123'),
  DEV_ADMIN_NAME: z.string().optional().default('PR VISION Admin'),
}).superRefine((data, ctx) => {
  if (data.NODE_ENV === 'production') {
    const DEFAULT_ACCESS = 'pr_vision_hrms_super_secure_access_secret_2026_jwt';
    const DEFAULT_REFRESH = 'pr_vision_hrms_super_secure_refresh_secret_2026_jwt';
    const DEFAULT_COOKIE = 'pr_vision_cookie_secret_key_hrms_2026';

    if (!data.JWT_ACCESS_SECRET || data.JWT_ACCESS_SECRET === DEFAULT_ACCESS || data.JWT_ACCESS_SECRET.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_ACCESS_SECRET'],
        message: 'Production requires a secure, non-default JWT_ACCESS_SECRET with at least 32 characters.',
      });
    }
    if (!data.JWT_REFRESH_SECRET || data.JWT_REFRESH_SECRET === DEFAULT_REFRESH || data.JWT_REFRESH_SECRET.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_REFRESH_SECRET'],
        message: 'Production requires a secure, non-default JWT_REFRESH_SECRET with at least 32 characters.',
      });
    }
    if (!data.COOKIE_SECRET || data.COOKIE_SECRET === DEFAULT_COOKIE || data.COOKIE_SECRET.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['COOKIE_SECRET'],
        message: 'Production requires a secure, non-default COOKIE_SECRET with at least 32 characters.',
      });
    }
    if (data.JWT_ACCESS_SECRET === data.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_REFRESH_SECRET'],
        message: 'Production requires distinct JWT_ACCESS_SECRET and JWT_REFRESH_SECRET values.',
      });
    }
    if (data.DEV_ADMIN_SEED_ENABLED) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DEV_ADMIN_SEED_ENABLED'],
        message: 'DEV_ADMIN_SEED_ENABLED must be false in production environments.',
      });
    }
  }
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment variables:', parsedEnv.error.format());
  process.exit(1);
}

export const env = parsedEnv.data;
