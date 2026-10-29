import { z } from 'zod';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const paginationQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export function createPageSchema<TItem extends z.ZodType>(
  itemSchema: TItem,
): z.ZodObject<{
  items: z.ZodArray<TItem>;
  page: z.ZodNumber;
  pageSize: z.ZodNumber;
  totalItems: z.ZodNumber;
  totalPages: z.ZodNumber;
}> {
  return z.object({
    items: z.array(itemSchema),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    totalItems: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  });
}
