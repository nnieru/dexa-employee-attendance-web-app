import type { z } from 'zod';

/** Validates environment variables at startup. Failure messages name fields, never values. */
export function parseConfig<Schema extends z.ZodType>(
  schema: Schema,
  source: Record<string, string | undefined> = process.env,
): z.infer<Schema> {
  const result = schema.safeParse(source);
  if (result.success) return result.data;

  const fields = result.error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
  throw new Error(`Invalid configuration: ${fields}`);
}
