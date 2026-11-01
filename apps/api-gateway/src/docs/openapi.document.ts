// The OpenAPI extension must load before any contract schema is built, so keep this import first.
import './extend-zod.js';

import { OpenAPIRegistry, OpenApiGeneratorV3, type RouteConfig } from '@asteasolutions/zod-to-openapi';
import type { OpenAPIObject } from '@nestjs/swagger';
import { API_PREFIX, PHOTO_CONTENT_TYPE, errorResponseSchema } from '@dexa/contracts';
import { API_ROUTES, type ApiRoute } from './openapi.routes.js';

const SECURITY_SCHEME_NAME = 'BearerAuth';
const OPENAPI_VERSION = '3.0.3';

/**
 * The object-shaped query and path schemas the RouteConfig names. Every table entry whose schema is an object
 * satisfies it directly.
 */
type ZodRouteParameter = NonNullable<
  NonNullable<RouteConfig['request']>['params']
>;

const ERROR_DESCRIPTION: Readonly<Record<number, string>> = {
  400: 'The request body, query, or path was refused by validation (VALIDATION_FAILED).',
  401: 'The token is missing or expired, or the account is not active (UNAUTHORIZED, ACCOUNT_DISABLED).',
  403: 'The role does not open this route (FORBIDDEN).',
  404: 'The requested record does not exist (NOT_FOUND).',
  409: 'The request conflicts with the stored attendance or request state (a 409 domain code).',
  413: 'The upload is larger than the limit (PAYLOAD_TOO_LARGE).',
  500: 'An unexpected failure (INTERNAL_ERROR).',
  503: 'A dependency is down or the process is not ready yet (DEPENDENCY_UNAVAILABLE).',
};

const API_TAGS: ReadonlyArray<{ name: string; description: string }> = [
  { name: 'Health', description: 'Readiness of the gateway process and its indicators.' },
  { name: 'Auth', description: 'Login, current account, and password change.' },
  { name: 'Attendance', description: 'Punches, the today state, and the two summaries.' },
  { name: 'Employees', description: 'The own profile and the HR roster.' },
  { name: 'Master data', description: 'HR-only lookups the pickers read.' },
  { name: 'Notifications', description: 'The HR inbox and its live stream.' },
  { name: 'Schedule', description: 'Schedule versions and calendar exceptions.' },
  { name: 'Requests', description: 'Overtime and correction requests, queues, and decisions.' },
];

type RouteResponses = NonNullable<RouteConfig['responses']>;

function toResponses(route: ApiRoute): RouteResponses {
  const responses: RouteResponses = {};
  for (const errorStatus of route.errors) {
    responses[errorStatus] = {
      description: ERROR_DESCRIPTION[errorStatus],
      content: { 'application/json': { schema: errorResponseSchema } },
    };
  }
  const success = route.success;
  if (success.kind === 'binary') {
    responses[success.status] = {
      description: success.description,
      content: { [PHOTO_CONTENT_TYPE]: { schema: { type: 'string', format: 'binary' } } },
    };
  } else if (success.kind === 'event-stream') {
    responses[success.status] = {
      description: success.description,
      content: { 'text/event-stream': {} },
    };
  } else if (success.status === 204) {
    responses[success.status] = { description: success.description };
  } else {
    responses[success.status] = {
      description: success.description,
      content: { 'application/json': { schema: success.schema } },
    };
  }
  return responses;
}

function toRouteConfig(route: ApiRoute): RouteConfig {
  const request: RouteConfig['request'] = {};
  if (route.requestParams !== undefined) request.params = route.requestParams.schema as ZodRouteParameter;
  if (route.requestQuery !== undefined) request.query = route.requestQuery as ZodRouteParameter;
  const requestBody = route.requestBody;
  if (requestBody !== undefined) {
    request.body =
      requestBody.mediaType === 'multipart/form-data'
        ? {
            content: {
              // The file part carries the JPEG bytes; the gateway interceptor checks the content before buffering it.
              'multipart/form-data': { schema: { type: 'string', format: 'binary' } },
            },
          }
        : { content: { 'application/json': { schema: requestBody.schema } } };
  }

  return {
    method: route.method,
    path: `/${API_PREFIX}${route.path}`,
    operationId: toOperationId(route),
    summary: route.summary,
    tags: [route.tag],
    security: route.isPublic === true ? undefined : [{ [SECURITY_SCHEME_NAME]: [] }],
    request,
    responses: toResponses(route),
  };
}

function toOperationId(route: ApiRoute): string {
  const camelPath = route.path
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.replace(/[^A-Za-z]/g, ''))
    .join('');
  return `${camelPath}${route.method}`;
}

/** The document the gateway serves at `/docs`, built from the zod contracts the routes validate with. */
export function buildOpenApiDocument(): OpenAPIObject {
  const registry = new OpenAPIRegistry();
  registry.registerComponent('securitySchemes', SECURITY_SCHEME_NAME, {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: 'The access token that POST /api/v1/auth/login returns.',
  });
  for (const route of API_ROUTES) {
    // The schemas pass through inline: naming them would require a registry registration, while inline
    // conversion reads the zod internals directly, so every realm documents correctly.
    registry.registerPath(toRouteConfig(route));
  }
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: OPENAPI_VERSION,
    info: {
      title: 'Dexa attendance gateway API',
      version: '1.0.0',
      description:
        'The REST surface of the WFH attendance and employee monitoring system. Response times are UTC instants; business dates use Asia/Jakarta. Every failure shares the ErrorResponse shape.',
    },
    servers: [{ url: '/' }],
    tags: [...API_TAGS],
  });
}
