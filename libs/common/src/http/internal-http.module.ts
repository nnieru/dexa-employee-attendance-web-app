import { HttpModule } from '@nestjs/axios';
import { Module, type DynamicModule } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AUTH_CONFIG } from '../auth/auth-config.token.js';
import { ServiceTokenSigner } from '../auth/service-token.signer.js';
import { SERVICE_TOKEN_SIGNER } from '../auth/service-token-signer.interface.js';
import type { AuthConfig } from '../config/auth-config.schema.js';
import { parseConfig } from '../config/parse-config.js';
import { INTERNAL_HTTP_CLIENT } from './internal-http-client.interface.js';
import { InternalHttpClient } from './internal-http.client.js';
import {
  InternalServiceBaseUrlsSchema,
  type InternalServiceBaseUrls,
} from './internal-service-base-urls.schema.js';
import { INTERNAL_SERVICE_BASE_URLS } from './internal-service-base-urls.token.js';

export type InternalHttpModuleOptions = {
  readonly serviceBaseUrls: InternalServiceBaseUrls;
  // The same validated config that AuthModule.forRoot takes. It signs the calls' service tokens.
  readonly authConfig: AuthConfig;
};

/**
 * Provides INTERNAL_HTTP_CLIENT to the whole application. Import it once, at the root.
 *
 * It signs with its own ServiceTokenSigner rather than importing AuthModule. AuthModule.forRoot
 * registers the process-wide Passport strategies, and a second import would register them again.
 */
@Module({})
export class InternalHttpModule {
  static forRoot(options: InternalHttpModuleOptions): DynamicModule {
    const serviceBaseUrls = parseConfig(InternalServiceBaseUrlsSchema, options.serviceBaseUrls);
    return {
      module: InternalHttpModule,
      global: true,
      imports: [HttpModule, JwtModule.register({})],
      providers: [
        { provide: AUTH_CONFIG, useValue: options.authConfig },
        { provide: SERVICE_TOKEN_SIGNER, useClass: ServiceTokenSigner },
        { provide: INTERNAL_SERVICE_BASE_URLS, useValue: serviceBaseUrls },
        { provide: INTERNAL_HTTP_CLIENT, useClass: InternalHttpClient },
      ],
      exports: [INTERNAL_HTTP_CLIENT],
    };
  }
}
