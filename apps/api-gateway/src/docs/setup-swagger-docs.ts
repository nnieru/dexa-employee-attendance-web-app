import type { INestApplication } from '@nestjs/common';
import { SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { buildOpenApiDocument } from './openapi.document.js';

/**
 * Mounts the browser docs at /docs and the raw document at /docs-json. The production default keeps them off;
 * callers enable them in development and in tests by passing the flag.
 */
export function setupSwaggerDocs(app: INestApplication): void {
  const document = buildOpenApiDocument();
  // The generated document structurally satisfies the OpenAPIObject shape the UI serves.
  SwaggerModule.setup('docs', app, document as unknown as OpenAPIObject);
}
