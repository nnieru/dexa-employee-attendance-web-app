import { Role } from '@dexa/contracts';
import { JwtService } from '@nestjs/jwt';
import { AuthConfigSchema, type AuthConfig } from '../config/auth-config.schema.js';
import { parseConfig } from '../config/parse-config.js';
import {
  authEnvironmentFor,
  generateAuthKeySet,
  servicePair,
  type AuthKeySet,
} from '../../test/auth-key-set.js';
import { SERVICE_JWT_ALGORITHM } from './jwt-algorithm.js';
import { ServiceName } from './service-name.js';
import { SERVICE_TOKEN_LIFETIME_SECONDS, ServiceTokenSigner } from './service-token.signer.js';

const ACCOUNT_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';
const SECONDS_PER_MILLISECOND = 1000;

type DecodedClaims = {
  readonly iss: string;
  readonly sub: string;
  readonly aud: string;
  readonly iat: number;
  readonly exp: number;
  readonly user?: unknown;
};

describe('ServiceTokenSigner', () => {
  let keys: AuthKeySet;
  let jwtService: JwtService;

  beforeAll(() => {
    keys = generateAuthKeySet();
    jwtService = new JwtService();
  });

  function signerFor(serviceName: ServiceName): { signer: ServiceTokenSigner; config: AuthConfig } {
    const config = parseConfig(AuthConfigSchema, authEnvironmentFor(keys, serviceName));
    return { signer: new ServiceTokenSigner(jwtService, config), config };
  }

  // Verifies the signature with the caller's public key, so the claims read here are the ones a receiver accepts.
  async function verifiedClaims(
    token: string,
    caller: ServiceName,
    audience: ServiceName,
  ): Promise<DecodedClaims> {
    return jwtService.verifyAsync<DecodedClaims>(token, {
      publicKey: servicePair(keys, caller).publicKeyPem,
      algorithms: [SERVICE_JWT_ALGORITHM],
      issuer: caller,
      audience,
    });
  }

  it('should sign a token for the target that names the caller as issuer and subject with a 60 second lifetime', async () => {
    const { signer } = signerFor(ServiceName.EMPLOYEE_SERVICE);

    const token = await signer.signFor(ServiceName.AUTH_SERVICE);
    const claims = await verifiedClaims(
      token,
      ServiceName.EMPLOYEE_SERVICE,
      ServiceName.AUTH_SERVICE,
    );

    expect(claims.sub).toBe(ServiceName.EMPLOYEE_SERVICE);
    expect(claims.aud).toBe(ServiceName.AUTH_SERVICE);
    expect(claims.exp - claims.iat).toBe(SERVICE_TOKEN_LIFETIME_SECONDS);
    expect(SERVICE_TOKEN_LIFETIME_SECONDS).toBe(60);
    expect(claims.user).toBeUndefined();
  });

  it('should name the caller as the key ID so the receiver picks the right public key', async () => {
    const { signer } = signerFor(ServiceName.API_GATEWAY);

    const token = await signer.signFor(ServiceName.EMPLOYEE_SERVICE);
    const header = jwtService.decode<{ kid?: string }>(token, { complete: true }).header;

    expect(header.kid).toBe(ServiceName.API_GATEWAY);
  });

  it('should add the user ID and role as the user claim when the gateway signs on behalf of a user', async () => {
    const { signer } = signerFor(ServiceName.API_GATEWAY);

    const token = await signer.signFor(ServiceName.EMPLOYEE_SERVICE, {
      accountId: ACCOUNT_ID,
      role: Role.HR,
    });
    const claims = await verifiedClaims(
      token,
      ServiceName.API_GATEWAY,
      ServiceName.EMPLOYEE_SERVICE,
    );

    expect(claims.user).toEqual({ accountId: ACCOUNT_ID, role: Role.HR });
    expect(claims.exp - claims.iat).toBe(SERVICE_TOKEN_LIFETIME_SECONDS);
  });

  it('should copy only the account ID and role into the user claim', async () => {
    const { signer } = signerFor(ServiceName.API_GATEWAY);
    const userWithExtraFields = {
      accountId: ACCOUNT_ID,
      role: Role.EMPLOYEE,
      email: 'x@example.test',
    };

    const token = await signer.signFor(ServiceName.EMPLOYEE_SERVICE, userWithExtraFields);
    const claims = await verifiedClaims(
      token,
      ServiceName.API_GATEWAY,
      ServiceName.EMPLOYEE_SERVICE,
    );

    expect(claims.user).toEqual({ accountId: ACCOUNT_ID, role: Role.EMPLOYEE });
  });

  it('should refuse to sign on behalf of a user when the caller is not api-gateway', async () => {
    const { signer } = signerFor(ServiceName.EMPLOYEE_SERVICE);

    await expect(
      signer.signFor(ServiceName.AUTH_SERVICE, { accountId: ACCOUNT_ID, role: Role.HR }),
    ).rejects.toThrow('employee-service cannot sign a token on behalf of a user.');
  });

  it('should set the expiry 60 seconds after the issue time, counted in whole seconds', async () => {
    const { signer } = signerFor(ServiceName.API_GATEWAY);
    const before = Date.now() / SECONDS_PER_MILLISECOND;

    const token = await signer.signFor(ServiceName.AUTH_SERVICE);
    const claims = await verifiedClaims(token, ServiceName.API_GATEWAY, ServiceName.AUTH_SERVICE);

    expect(claims.iat).toBeGreaterThanOrEqual(Math.floor(before));
    expect(claims.exp).toBe(claims.iat + SERVICE_TOKEN_LIFETIME_SECONDS);
  });
});
