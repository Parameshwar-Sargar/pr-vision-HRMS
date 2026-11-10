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
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment variables:', parsedEnv.error.format());
  process.exit(1);
}

export const env = parsedEnv.data;
