import { Role } from '@dexa/contracts';
import { Controller, Get, UseGuards, type INestApplication } from '@nestjs/common';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { AuthenticatedUser } from '../src/auth/authenticated-principal.js';
import { AuthModule } from '../src/auth/auth.module.js';
import { CurrentUser } from '../src/auth/current-user.decorator.js';
import { GatewayUserAuthGuard } from '../src/auth/gateway-user-auth.guard.js';
import { UserTokenVerificationModule } from '../src/auth/user-token-verification.module.js';
import {
  ACCOUNT_STATUS_READER,
  type IAccountStatusReader,
} from '../src/auth/account-status-reader.interface.js';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard.js';
import { ServiceAuthGuard } from '../src/auth/service-auth.guard.js';
import { ServiceName } from '../src/auth/service-name.js';
import {
  SERVICE_TOKEN_SIGNER,
  type IServiceTokenSigner,
} from '../src/auth/service-token-signer.interface.js';
import { configureApp } from '../src/bootstrap/configure-app.js';
import { AuthConfigSchema, UserJwtVerifierConfigSchema } from '../src/config/auth-config.schema.js';
import { parseConfig } from '../src/config/parse-config.js';
import {
  USER_JWT_AUDIENCE,
  USER_JWT_ISSUER,
  authEnvironmentFor,
  generateAuthKeySet,
  generateEcKeyPair,
  generateRsaKeyPair,
  servicePair,
  userJwtVerifierEnvironmentFor,
  type AuthKeySet,
  type PemKeyPair,
} from './auth-key-set.js';

const ACCOUNT_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';

// 2100-01-01T00:00:00Z and 1970-01-01T00:00:01Z keep the expiry cases independent of the clock.
const FAR_FUTURE_EXPIRY_SECONDS = 4_102_444_800;
const PAST_EXPIRY_SECONDS = 1;

// Signs HS256 and HS512 tokens. No service is configured with it, so these tokens only prove refusal.
const UNCONFIGURED_HMAC_SECRET = 'attacker-secret-not-configured-anywhere-0001';

const UNAUTHORIZED_RESPONSE = { statusCode: 401, code: 'UNAUTHORIZED', message: 'Unauthorized' };
const INTERNAL_PATH = '/api/v1/test-auth/internal';
const USER_PATH = '/api/v1/test-auth/user';
const GATEWAY_USER_PATH = '/api/v1/test-auth/gateway-user';
const UNGUARDED_USER_PATH = '/api/v1/test-auth/unguarded-user';

const GATEWAY = ServiceName.API_GATEWAY;
const EMPLOYEE = ServiceName.EMPLOYEE_SERVICE;
const ATTENDANCE = ServiceName.ATTENDANCE_SERVICE;

const VALID_SERVICE_CLAIMS = { exp: FAR_FUTURE_EXPIRY_SECONDS };

const VALID_USER_CLAIMS = {
  sub: ACCOUNT_ID,
  role: Role.EMPLOYEE,
  exp: FAR_FUTURE_EXPIRY_SECONDS,
};

// A token api-gateway signs for a forwarded call: the user is named by a claim, and the subject is the gateway.
const VALID_GATEWAY_USER_CLAIMS = {
  exp: FAR_FUTURE_EXPIRY_SECONDS,
  user: { accountId: ACCOUNT_ID, role: Role.EMPLOYEE },
};

type RejectedToken = { readonly condition: string; readonly mintToken: () => Promise<string> };

// Test-only routes: a gateway user route, an end-user JWT route, an internal route, and a user route that forgot its guard.
@Controller('test-auth')
class AuthTestController {
  @Get('gateway-user')
  @UseGuards(GatewayUserAuthGuard)
  gatewayUser(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  @Get('user')
  @UseGuards(JwtAuthGuard)
  user(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  @Get('unguarded-user')
  unguardedUser(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  @Get('internal')
  @UseGuards(ServiceAuthGuard)
  internal(): { accepted: true } {
    return { accepted: true };
  }
}

// The token cases here cover signatures and claims. Every account is active, so the status check passes and
// only the token is under test. Status cases live in jwt-auth.guard.spec.ts.
const activeAccountStatusReader: IAccountStatusReader = {
  findAccountStatus: () => Promise.resolve({ isActive: true }),
};

const jwtService = new JwtService();

// jsonwebtoken refuses to sign with "none", so the unsigned token is assembled by hand.
function craftUnsignedToken(claims: object, header: object): string {
  return `${encodeSegment(header)}.${encodeSegment(claims)}.`;
}

function encodeSegment(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

// Signing options for a service token. kid, iss, and sub name the caller, and aud names the target.
function serviceSigning(
  privateKeyPem: string,
  caller: ServiceName,
  target: ServiceName,
): JwtSignOptions {
  return {
    privateKey: privateKeyPem,
    algorithm: 'ES256',
    keyid: caller,
    issuer: caller,
    subject: caller,
    audience: target,
  };
}

// Signing options for a token api-gateway forwards to one target service.
function gatewayUserSigning(keys: AuthKeySet, target: ServiceName): JwtSignOptions {
  return serviceSigning(servicePair(keys, GATEWAY).privateKeyPem, GATEWAY, target);
}

function userSigning(privateKeyPem: string): JwtSignOptions {
  return {
    privateKey: privateKeyPem,
    algorithm: 'RS256',
    issuer: USER_JWT_ISSUER,
    audience: USER_JWT_AUDIENCE,
  };
}

describe('auth guards', () => {
  let keys: AuthKeySet;
  let app: INestApplication;
  let signer: IServiceTokenSigner;
  let unconfiguredServiceKey: PemKeyPair;
  let unconfiguredUserKey: PemKeyPair;

  beforeAll(async () => {
    keys = generateAuthKeySet();
    unconfiguredServiceKey = generateEcKeyPair();
    unconfiguredUserKey = generateRsaKeyPair();
    const serviceConfig = parseConfig(AuthConfigSchema, authEnvironmentFor(keys, EMPLOYEE));
    const userConfig = parseConfig(
      UserJwtVerifierConfigSchema,
      userJwtVerifierEnvironmentFor(keys),
    );
    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule.forRoot(serviceConfig), UserTokenVerificationModule.forRoot(userConfig)],
      controllers: [AuthTestController],
      providers: [{ provide: ACCOUNT_STATUS_READER, useValue: activeAccountStatusReader }],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, { CORS_ORIGINS: [] });
    await app.init();
    signer = app.get<IServiceTokenSigner>(SERVICE_TOKEN_SIGNER);
  });

  afterAll(async () => {
    await app.close();
  });

  async function expectUnauthorized(path: string, token?: string): Promise<void> {
    const httpRequest = request(app.getHttpServer()).get(path);
    if (token !== undefined) httpRequest.set('Authorization', `Bearer ${token}`);

    const response = await httpRequest.expect(401);
    expect(response.body).toEqual(UNAUTHORIZED_RESPONSE);
  }

  function gatewayToEmployee(): JwtSignOptions {
    return serviceSigning(servicePair(keys, GATEWAY).privateKeyPem, GATEWAY, EMPLOYEE);
  }

  const rejectedServiceTokens: ReadonlyArray<RejectedToken> = [
    {
      condition: 'the token has expired',
      mintToken: () => jwtService.signAsync({ exp: PAST_EXPIRY_SECONDS }, gatewayToEmployee()),
    },
    {
      condition: 'the token has no expiry claim',
      mintToken: () => jwtService.signAsync({}, gatewayToEmployee()),
    },
    {
      condition: 'the signer addressed it to another service',
      mintToken: () => signer.signFor(ATTENDANCE),
    },
    {
      condition: 'the kid is not a known service',
      mintToken: () =>
        jwtService.signAsync(VALID_SERVICE_CLAIMS, {
          ...gatewayToEmployee(),
          keyid: 'billing-service',
        }),
    },
    {
      condition: 'the kid is missing from the header',
      mintToken: () =>
        jwtService.signAsync(VALID_SERVICE_CLAIMS, {
          privateKey: servicePair(keys, GATEWAY).privateKeyPem,
          algorithm: 'ES256',
          issuer: GATEWAY,
          subject: GATEWAY,
          audience: EMPLOYEE,
        }),
    },
    {
      condition: 'the issuer and subject name another service under this caller kid',
      mintToken: () =>
        jwtService.signAsync(VALID_SERVICE_CLAIMS, {
          ...gatewayToEmployee(),
          issuer: ATTENDANCE,
          subject: ATTENDANCE,
        }),
    },
    {
      condition: 'the subject differs from the issuer',
      mintToken: () =>
        jwtService.signAsync(VALID_SERVICE_CLAIMS, {
          ...gatewayToEmployee(),
          subject: ServiceName.AUTH_SERVICE,
        }),
    },
    {
      condition: 'it is signed with another service key while naming this caller',
      mintToken: () =>
        jwtService.signAsync(
          VALID_SERVICE_CLAIMS,
          serviceSigning(servicePair(keys, ATTENDANCE).privateKeyPem, GATEWAY, EMPLOYEE),
        ),
    },
    {
      condition: 'it is signed with a key that is not configured',
      mintToken: () =>
        jwtService.signAsync(
          VALID_SERVICE_CLAIMS,
          serviceSigning(unconfiguredServiceKey.privateKeyPem, GATEWAY, EMPLOYEE),
        ),
    },
    {
      condition: 'it is signed with the user private key',
      mintToken: () =>
        jwtService.signAsync(VALID_SERVICE_CLAIMS, {
          privateKey: keys.user.privateKeyPem,
          algorithm: 'RS256',
          keyid: GATEWAY,
          issuer: GATEWAY,
          subject: GATEWAY,
          audience: EMPLOYEE,
        }),
    },
    {
      condition: 'it is HS256 with the caller public key as the HMAC secret',
      mintToken: () =>
        jwtService.signAsync(VALID_SERVICE_CLAIMS, {
          secret: servicePair(keys, GATEWAY).publicKeyPem,
          algorithm: 'HS256',
          keyid: GATEWAY,
          issuer: GATEWAY,
          subject: GATEWAY,
          audience: EMPLOYEE,
        }),
    },
    {
      condition: 'it is signed with HS512',
      mintToken: () =>
        jwtService.signAsync(VALID_SERVICE_CLAIMS, {
          secret: UNCONFIGURED_HMAC_SECRET,
          algorithm: 'HS512',
          keyid: GATEWAY,
          issuer: GATEWAY,
          subject: GATEWAY,
          audience: EMPLOYEE,
        }),
    },
    {
      condition: 'it is unsigned with alg none',
      mintToken: async () =>
        craftUnsignedToken(
          {
            iss: GATEWAY,
            sub: GATEWAY,
            aud: EMPLOYEE,
            exp: FAR_FUTURE_EXPIRY_SECONDS,
          },
          { alg: 'none', typ: 'JWT', kid: GATEWAY },
        ),
    },
  ];

  // Tokens that api-gateway would sign for a forwarded user call. Each one breaks exactly one rule.
  const rejectedGatewayUserTokens: ReadonlyArray<RejectedToken> = [
    {
      condition: 'the token has expired',
      mintToken: () =>
        jwtService.signAsync(
          { ...VALID_GATEWAY_USER_CLAIMS, exp: PAST_EXPIRY_SECONDS },
          gatewayUserSigning(keys, EMPLOYEE),
        ),
    },
    {
      condition: 'the token has no expiry claim',
      mintToken: () =>
        jwtService.signAsync(
          { user: VALID_GATEWAY_USER_CLAIMS.user },
          gatewayUserSigning(keys, EMPLOYEE),
        ),
    },
    {
      condition: 'the token has no user claim',
      mintToken: () =>
        jwtService.signAsync(
          { exp: FAR_FUTURE_EXPIRY_SECONDS },
          gatewayUserSigning(keys, EMPLOYEE),
        ),
    },
    {
      condition: 'the user role is not a known role',
      mintToken: () =>
        jwtService.signAsync(
          { ...VALID_GATEWAY_USER_CLAIMS, user: { accountId: ACCOUNT_ID, role: 'ADMIN' } },
          gatewayUserSigning(keys, EMPLOYEE),
        ),
    },
    {
      condition: 'the user account ID is not a UUID',
      mintToken: () =>
        jwtService.signAsync(
          { ...VALID_GATEWAY_USER_CLAIMS, user: { accountId: 'not-a-uuid', role: Role.HR } },
          gatewayUserSigning(keys, EMPLOYEE),
        ),
    },
    {
      condition: 'the token is addressed to another service',
      mintToken: () =>
        jwtService.signAsync(VALID_GATEWAY_USER_CLAIMS, gatewayUserSigning(keys, ATTENDANCE)),
    },
    {
      condition: 'the token was signed by another service while naming the gateway',
      mintToken: () =>
        jwtService.signAsync(
          VALID_GATEWAY_USER_CLAIMS,
          serviceSigning(servicePair(keys, ATTENDANCE).privateKeyPem, GATEWAY, EMPLOYEE),
        ),
    },
    {
      condition: 'an employee-service token carries a user claim (issuer is not the gateway)',
      mintToken: () =>
        jwtService.signAsync(
          VALID_GATEWAY_USER_CLAIMS,
          serviceSigning(servicePair(keys, EMPLOYEE).privateKeyPem, EMPLOYEE, EMPLOYEE),
        ),
    },
    {
      condition: 'the subject names another service under the gateway kid',
      mintToken: () =>
        jwtService.signAsync(VALID_GATEWAY_USER_CLAIMS, {
          ...gatewayUserSigning(keys, EMPLOYEE),
          subject: ATTENDANCE,
        }),
    },
    {
      condition: 'the kid is missing from the header',
      mintToken: () =>
        jwtService.signAsync(VALID_GATEWAY_USER_CLAIMS, {
          privateKey: servicePair(keys, GATEWAY).privateKeyPem,
          algorithm: 'ES256',
          issuer: GATEWAY,
          subject: GATEWAY,
          audience: EMPLOYEE,
        }),
    },
    {
      condition: 'it is signed with a key that is not configured',
      mintToken: () =>
        jwtService.signAsync(
          VALID_GATEWAY_USER_CLAIMS,
          serviceSigning(unconfiguredServiceKey.privateKeyPem, GATEWAY, EMPLOYEE),
        ),
    },
    {
      condition: 'it is a user JWT signed by auth-service',
      mintToken: () =>
        jwtService.signAsync(VALID_USER_CLAIMS, userSigning(keys.user.privateKeyPem)),
    },
    {
      condition: 'it is HS256 with the gateway public key as the HMAC secret',
      mintToken: () =>
        jwtService.signAsync(VALID_GATEWAY_USER_CLAIMS, {
          secret: servicePair(keys, GATEWAY).publicKeyPem,
          algorithm: 'HS256',
          keyid: GATEWAY,
          issuer: GATEWAY,
          subject: GATEWAY,
          audience: EMPLOYEE,
        }),
    },
    {
      condition: 'it is unsigned with alg none',
      mintToken: async () =>
        craftUnsignedToken(
          {
            iss: GATEWAY,
            sub: GATEWAY,
            aud: EMPLOYEE,
            exp: FAR_FUTURE_EXPIRY_SECONDS,
            user: VALID_GATEWAY_USER_CLAIMS.user,
          },
          { alg: 'none', typ: 'JWT', kid: GATEWAY },
        ),
    },
  ];

  const rejectedUserTokens: ReadonlyArray<RejectedToken> = [
    {
      condition: 'the token has expired',
      mintToken: () =>
        jwtService.signAsync(
          { ...VALID_USER_CLAIMS, exp: PAST_EXPIRY_SECONDS },
          userSigning(keys.user.privateKeyPem),
        ),
    },
    {
      condition: 'the token has no expiry claim',
      mintToken: () =>
        jwtService.signAsync(
          { sub: ACCOUNT_ID, role: Role.EMPLOYEE },
          userSigning(keys.user.privateKeyPem),
        ),
    },
    {
      condition: 'it is signed with a service key',
      mintToken: () =>
        jwtService.signAsync(VALID_USER_CLAIMS, {
          privateKey: servicePair(keys, GATEWAY).privateKeyPem,
          algorithm: 'ES256',
          issuer: USER_JWT_ISSUER,
          audience: USER_JWT_AUDIENCE,
        }),
    },
    {
      condition: 'it is signed with a key that is not configured',
      mintToken: () =>
        jwtService.signAsync(VALID_USER_CLAIMS, userSigning(unconfiguredUserKey.privateKeyPem)),
    },
    {
      condition: 'the role is not a known role',
      mintToken: () =>
        jwtService.signAsync(
          { ...VALID_USER_CLAIMS, role: 'ADMIN' },
          userSigning(keys.user.privateKeyPem),
        ),
    },
    {
      condition: 'the issuer is not the user issuer',
      mintToken: () =>
        jwtService.signAsync(VALID_USER_CLAIMS, {
          ...userSigning(keys.user.privateKeyPem),
          issuer: GATEWAY,
        }),
    },
    {
      condition: 'the audience is not the user audience',
      mintToken: () =>
        jwtService.signAsync(VALID_USER_CLAIMS, {
          ...userSigning(keys.user.privateKeyPem),
          audience: EMPLOYEE,
        }),
    },
    {
      condition: 'it is HS256 with the user public key as the HMAC secret',
      mintToken: () =>
        jwtService.signAsync(VALID_USER_CLAIMS, {
          secret: keys.user.publicKeyPem,
          algorithm: 'HS256',
          issuer: USER_JWT_ISSUER,
          audience: USER_JWT_AUDIENCE,
        }),
    },
    {
      condition: 'it is signed with HS512',
      mintToken: () =>
        jwtService.signAsync(VALID_USER_CLAIMS, {
          secret: UNCONFIGURED_HMAC_SECRET,
          algorithm: 'HS512',
          issuer: USER_JWT_ISSUER,
          audience: USER_JWT_AUDIENCE,
        }),
    },
    {
      condition: 'it is unsigned with alg none',
      mintToken: async () =>
        craftUnsignedToken(
          {
            sub: ACCOUNT_ID,
            role: Role.HR,
            iss: USER_JWT_ISSUER,
            aud: USER_JWT_AUDIENCE,
            exp: FAR_FUTURE_EXPIRY_SECONDS,
          },
          { alg: 'none', typ: 'JWT' },
        ),
    },
    {
      condition: 'it is a service token',
      mintToken: () => signer.signFor(EMPLOYEE),
    },
  ];

  describe('ServiceAuthGuard on an internal route', () => {
    it('should return 401 when the Authorization header is missing', async () => {
      await expectUnauthorized(INTERNAL_PATH);
    });

    it('should return 200 when the signer issues a token addressed to this service', async () => {
      const token = await signer.signFor(EMPLOYEE);

      await request(app.getHttpServer())
        .get(INTERNAL_PATH)
        .set('Authorization', `Bearer ${token}`)
        .expect(200, { accepted: true });
    });

    it('should return 200 when api-gateway signs a token addressed to this service', async () => {
      const token = await jwtService.signAsync(VALID_SERVICE_CLAIMS, gatewayToEmployee());

      await request(app.getHttpServer())
        .get(INTERNAL_PATH)
        .set('Authorization', `Bearer ${token}`)
        .expect(200, { accepted: true });
    });

    it('should return 401 when api-gateway signs a user token for this service', async () => {
      // A token that names a user is a user credential, so a service route does not accept it.
      const token = await jwtService.signAsync(VALID_GATEWAY_USER_CLAIMS, gatewayToEmployee());

      await expectUnauthorized(INTERNAL_PATH, token);
    });

    it.each(rejectedServiceTokens)('should return 401 when $condition', async ({ mintToken }) => {
      await expectUnauthorized(INTERNAL_PATH, await mintToken());
    });
  });

  describe('GatewayUserAuthGuard on a user route', () => {
    it('should return 401 when the Authorization header is missing', async () => {
      await expectUnauthorized(GATEWAY_USER_PATH);
    });

    it.each([Role.EMPLOYEE, Role.HR])(
      'should return the account ID and role when api-gateway forwards the role %s',
      async (role) => {
        const token = await jwtService.signAsync(
          { ...VALID_GATEWAY_USER_CLAIMS, user: { accountId: ACCOUNT_ID, role } },
          gatewayUserSigning(keys, EMPLOYEE),
        );

        const response = await request(app.getHttpServer())
          .get(GATEWAY_USER_PATH)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(response.body).toEqual({ accountId: ACCOUNT_ID, role });
      },
    );

    it.each(rejectedGatewayUserTokens)(
      'should return 401 when $condition',
      async ({ mintToken }) => {
        await expectUnauthorized(GATEWAY_USER_PATH, await mintToken());
      },
    );
  });

  describe('JwtAuthGuard wiring', () => {
    // A gateway that forgets to bind the reader must fail at startup. A guard that failed open here would
    // let a deactivated account through.
    it('should refuse to compile when no account status reader is bound', async () => {
      const serviceConfig = parseConfig(AuthConfigSchema, authEnvironmentFor(keys, EMPLOYEE));
      const userConfig = parseConfig(
        UserJwtVerifierConfigSchema,
        userJwtVerifierEnvironmentFor(keys),
      );

      await expect(
        Test.createTestingModule({
          imports: [
            AuthModule.forRoot(serviceConfig),
            UserTokenVerificationModule.forRoot(userConfig),
          ],
          controllers: [AuthTestController],
        }).compile(),
      ).rejects.toThrow(/IAccountStatusReader/);
    });
  });

  describe('JwtAuthGuard and CurrentUser on an end-user route', () => {
    it('should return 401 when the Authorization header is missing', async () => {
      await expectUnauthorized(USER_PATH);
    });

    it.each([Role.EMPLOYEE, Role.HR])(
      'should return the account ID and role when the token carries the role %s',
      async (role) => {
        const token = await jwtService.signAsync(
          { ...VALID_USER_CLAIMS, role },
          userSigning(keys.user.privateKeyPem),
        );

        const response = await request(app.getHttpServer())
          .get(USER_PATH)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(response.body).toEqual({ accountId: ACCOUNT_ID, role });
      },
    );

    it.each(rejectedUserTokens)('should return 401 when $condition', async ({ mintToken }) => {
      await expectUnauthorized(USER_PATH, await mintToken());
    });

    it('should return 401 when a route reads @CurrentUser() without a guard', async () => {
      const token = await jwtService.signAsync(
        VALID_USER_CLAIMS,
        userSigning(keys.user.privateKeyPem),
      );

      await expectUnauthorized(UNGUARDED_USER_PATH, token);
    });
  });
});
