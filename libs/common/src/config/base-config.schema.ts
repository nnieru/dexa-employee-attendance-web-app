import { z } from 'zod';
import { isIanaTimeZone } from '../time/is-iana-time-zone.js';

export const BaseConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).optional(),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    ),
  BUSINESS_TIMEZONE: z
    .string()
    .refine(isIanaTimeZone, 'must be an IANA time zone such as Asia/Jakarta'),
});

export type BaseConfig = z.infer<typeof BaseConfigSchema>;
