// Single public entry point. Zod schemas, inferred types, event names and error codes live here.
export { API_PREFIX } from './api-prefix.js';
export { Role } from './auth/role.js';
export { ErrorCode } from './errors/error-code.js';
export { errorResponseSchema, type ErrorResponse } from './errors/error-response.schema.js';
export {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  createPageSchema,
  paginationQuerySchema,
  type PaginationQuery,
} from './pagination/pagination.schema.js';
