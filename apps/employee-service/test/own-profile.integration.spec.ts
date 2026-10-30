import { Buffer } from 'node:buffer';
import { createSign, randomUUID } from 'node:crypto';
import {
  ACCOUNT_STATUS_READER,
  configureApp,
  parseConfig,
  type IAccountStatusReader,
} from '@dexa/common';
import {
  ownProfileSchema,
  ProfileStatus,
  Role,
  type AccountLookupItem,
  type AccountStatus,
  type OwnProfile,
} from '@dexa/contracts';
import type { Database } from '@dexa/db';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { createAppModule } from '../src/app.module.js';
import {
  AUTH_ACCOUNT_CLIENT,
  type IAuthAccountClient,
} from '../src/auth-accounts/auth-account-client.interface.js';
import { EmployeeServiceConfigSchema } from '../src/config/employee-service-config.schema.js';
import { DATABASE } from '../src/infrastructure/db/database.token.js';
import {
  employees,
  masterEmployeeStatuses,
  masterPositions,
} from '../src/infrastructure/db/schema.js';
import { USER_JWT_AUDIENCE, USER_JWT_ISSUER, type AuthKeySet } from './auth-key-set.js';
import {
  employeeServiceAuthKeys,
  employeeServiceEnvironment,
} from './employee-service-environment.js';

// Starting the container pulls an image on a cold machine, which exceeds Jest's 5 second default.
const CONTAINER_TIMEOUT_MS = 120_000;
const TEST_TIMEOUT_MS = 30_000;
const OWN_PROFILE_PATH = '/api/v1/employees/me';
const TOKEN_LIFETIME_SECONDS = 300;
const PHOTO_URL = '/api/v1/employees/me/photo';
const PHOTO_KEY = '3f1b2c4d-0a9e-4b8f-8c7d-6e5f4a3b2c1d.jpg';
const PROFILE_NOT_FOUND_BODY = {
  statusCode: 404,
  code: 'NOT_FOUND',
  message: 'Employee profile not found.',
};

const SEED_DOCUMENT = {
  positions: [
    { code: 'HR_OFFICER', name: 'HR Officer' },
    { code: 'FULLSTACK_DEVELOPER', name: 'Fullstack Developer' },
  ],
  employeeStatuses: [
    { code: 'ACTIVE', name: 'Active' },
    { code: 'INACTIVE', name: 'Inactive' },
  ],
};

// Stands in for auth-service, which owns the accounts. An ID that is not in the directory has no account
// for the lookup, and an ID missing from the status map is an unknown account for the guard.
const accountStatuses = new Map<string, AccountStatus>();
const fakeAccountStatusReader: IAccountStatusReader = {
  findAccountStatus: (accountId) => Promise.resolve(accountStatuses.get(accountId)),
};
const accountDirectory = new Map<string, AccountLookupItem>();
const fakeAuthAccountClient: IAuthAccountClient = {
  findAccountById: (accountId) => Promise.resolve(accountDirectory.get(accountId)),
};

function encodeJsonSegment(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

// Signs a user token with the test user key. Only auth-service holds that key in production.
function signUserToken(
  keys: AuthKeySet,
  accountId: string,
  role: Role,
  expiresAtSeconds: number,
): string {
  const signingInput = [
    encodeJsonSegment({ alg: 'RS256', typ: 'JWT' }),
    encodeJsonSegment({
      sub: accountId,
      role,
      iss: USER_JWT_ISSUER,
      aud: USER_JWT_AUDIENCE,
      exp: expiresAtSeconds,
    }),
  ].join('.');
  const signature = createSign('RSA-SHA256')
    .update(signingInput)
    .sign(keys.user.privateKeyPem, 'base64url');
  return `${signingInput}.${signature}`;
}

function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

describe('employee-service own profile', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let database: Database;
  let employeeToken: string;
  let secondEmployeeToken: string;
  let hrToken: string;
  let unprovisionedToken: string;
  let orphanedToken: string;
  let expiredEmployeeToken: string;
  let employeeAccountId: string;
  let secondEmployeeAccountId: string;
  let hrAccountId: string;

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  }, CONTAINER_TIMEOUT_MS);

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18').start();
    const config = parseConfig(
      EmployeeServiceConfigSchema,
      employeeServiceEnvironment({
        EMPLOYEE_DATABASE_URL: container.getConnectionUri(),
        EMPLOYEE_MASTER_DATA: JSON.stringify(SEED_DOCUMENT),
      }),
    );
    const moduleRef = await Test.createTestingModule({
      imports: [createAppModule(config)],
    })
      .overrideProvider(ACCOUNT_STATUS_READER)
      .useValue(fakeAccountStatusReader)
      .overrideProvider(AUTH_ACCOUNT_CLIENT)
      .useValue(fakeAuthAccountClient)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app, { CORS_ORIGINS: [] });
    await app.init();
    database = moduleRef.get<Database>(DATABASE);

    const keys = employeeServiceAuthKeys();
    const expiresLater = nowInSeconds() + TOKEN_LIFETIME_SECONDS;
    employeeAccountId = registerAccount({ email: 'nadia.rahma@dexa.test', role: Role.EMPLOYEE });
    secondEmployeeAccountId = registerAccount({
      email: 'bima.saputra@dexa.test',
      role: Role.EMPLOYEE,
    });
    hrAccountId = registerAccount({ email: 'sari.lestari@dexa.test', role: Role.HR });
    // Active in the status reader, but Auth's lookup does not return it, so it has no profile email.
    const orphanedAccountId = registerAccount({
      email: 'orphan@dexa.test',
      role: Role.EMPLOYEE,
      inDirectory: false,
    });
    const unprovisionedAccountId = registerAccount({
      email: 'new.hire@dexa.test',
      role: Role.EMPLOYEE,
    });

    await insertEmployee({
      accountId: employeeAccountId,
      name: 'Nadia Rahma',
      positionCode: 'FULLSTACK_DEVELOPER',
      phoneNumber: '+6281234567890',
      photoKey: PHOTO_KEY,
      profileStatus: ProfileStatus.COMPLETE,
    });
    await insertEmployee({
      accountId: secondEmployeeAccountId,
      name: 'Bima Saputra',
      positionCode: 'FULLSTACK_DEVELOPER',
      phoneNumber: null,
      photoKey: null,
      profileStatus: ProfileStatus.INCOMPLETE,
    });
    await insertEmployee({
      accountId: hrAccountId,
      name: 'Sari Lestari',
      positionCode: 'HR_OFFICER',
      phoneNumber: '081234567890',
      photoKey: null,
      profileStatus: ProfileStatus.INCOMPLETE,
    });
    await insertEmployee({
      accountId: orphanedAccountId,
      name: 'Orphan Profile',
      positionCode: 'FULLSTACK_DEVELOPER',
      phoneNumber: null,
      photoKey: null,
      profileStatus: ProfileStatus.INCOMPLETE,
    });

    employeeToken = signUserToken(keys, employeeAccountId, Role.EMPLOYEE, expiresLater);
    secondEmployeeToken = signUserToken(keys, secondEmployeeAccountId, Role.EMPLOYEE, expiresLater);
    hrToken = signUserToken(keys, hrAccountId, Role.HR, expiresLater);
    unprovisionedToken = signUserToken(keys, unprovisionedAccountId, Role.EMPLOYEE, expiresLater);
    orphanedToken = signUserToken(keys, orphanedAccountId, Role.EMPLOYEE, expiresLater);
    expiredEmployeeToken = signUserToken(
      keys,
      employeeAccountId,
      Role.EMPLOYEE,
      nowInSeconds() - 60,
    );
  }, CONTAINER_TIMEOUT_MS);

  function registerAccount(options: { email: string; role: Role; inDirectory?: boolean }): string {
    const accountId = randomUUID();
    accountStatuses.set(accountId, { isActive: true });
    if (options.inDirectory !== false) {
      accountDirectory.set(accountId, { id: accountId, email: options.email, role: options.role });
    }
    return accountId;
  }

  async function insertEmployee(options: {
    accountId: string;
    name: string;
    positionCode: string;
    phoneNumber: string | null;
    photoKey: string | null;
    profileStatus: ProfileStatus;
  }): Promise<void> {
    const [position] = await database.db
      .select({ id: masterPositions.id })
      .from(masterPositions)
      .where(eq(masterPositions.code, options.positionCode));
    const [status] = await database.db
      .select({ id: masterEmployeeStatuses.id })
      .from(masterEmployeeStatuses)
      .where(eq(masterEmployeeStatuses.code, 'ACTIVE'));
    if (position === undefined || status === undefined) {
      throw new Error('The master seed did not insert the rows this test needs.');
    }
    await database.db.insert(employees).values({
      accountId: options.accountId,
      name: options.name,
      positionId: position.id,
      employeeStatusId: status.id,
      profileStatus: options.profileStatus,
      phoneNumber: options.phoneNumber,
      photoKey: options.photoKey,
    });
  }

  function getWithToken(path: string, accessToken: string) {
    return request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${accessToken}`);
  }

  it(
    'should return the employee profile with the resolved position, Auth email, and protected photo URL when an employee token is sent',
    async () => {
      const response = await getWithToken(OWN_PROFILE_PATH, employeeToken).expect(200);

      expect(ownProfileSchema.parse(response.body)).toEqual<OwnProfile>({
        accountId: employeeAccountId,
        name: 'Nadia Rahma',
        email: 'nadia.rahma@dexa.test',
        position: { code: 'FULLSTACK_DEVELOPER', name: 'Fullstack Developer' },
        phoneNumber: '+6281234567890',
        photoUrl: PHOTO_URL,
        profileStatus: ProfileStatus.COMPLETE,
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return a null phone number and photo URL when the employee has not supplied them',
    async () => {
      const response = await getWithToken(OWN_PROFILE_PATH, secondEmployeeToken).expect(200);

      expect(response.body).toEqual({
        accountId: secondEmployeeAccountId,
        name: 'Bima Saputra',
        email: 'bima.saputra@dexa.test',
        position: { code: 'FULLSTACK_DEVELOPER', name: 'Fullstack Developer' },
        phoneNumber: null,
        photoUrl: null,
        profileStatus: ProfileStatus.INCOMPLETE,
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return the HR account own profile when an HR token is sent',
    async () => {
      const response = await getWithToken(OWN_PROFILE_PATH, hrToken).expect(200);

      expect(response.body).toEqual({
        accountId: hrAccountId,
        name: 'Sari Lestari',
        email: 'sari.lestari@dexa.test',
        position: { code: 'HR_OFFICER', name: 'HR Officer' },
        phoneNumber: '081234567890',
        photoUrl: null,
        profileStatus: ProfileStatus.INCOMPLETE,
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return only the signed-in employee profile when the request names another account',
    async () => {
      const path = `${OWN_PROFILE_PATH}?accountId=${hrAccountId}`;

      const response = await getWithToken(path, employeeToken)
        .set('X-Account-Id', secondEmployeeAccountId)
        .expect(200);

      expect(response.body).toMatchObject({ accountId: employeeAccountId, name: 'Nadia Rahma' });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return only the documented fields and no photo key, password, or hash when an employee token is sent',
    async () => {
      const response = await getWithToken(OWN_PROFILE_PATH, employeeToken).expect(200);

      expect(Object.keys(response.body as object).sort()).toEqual([
        'accountId',
        'email',
        'name',
        'phoneNumber',
        'photoUrl',
        'position',
        'profileStatus',
      ]);
      expect(JSON.stringify(response.body)).not.toContain(PHOTO_KEY);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 404 NOT_FOUND when the account has no employee profile',
    async () => {
      const response = await getWithToken(OWN_PROFILE_PATH, unprovisionedToken).expect(404);

      expect(response.body).toEqual(PROFILE_NOT_FOUND_BODY);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 404 NOT_FOUND without a partial profile when the auth lookup omits the account',
    async () => {
      const response = await getWithToken(OWN_PROFILE_PATH, orphanedToken).expect(404);

      expect(response.body).toEqual(PROFILE_NOT_FOUND_BODY);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 401 UNAUTHORIZED when no bearer token is sent',
    async () => {
      const response = await request(app.getHttpServer()).get(OWN_PROFILE_PATH).expect(401);

      expect(response.body).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 401 UNAUTHORIZED when the employee token has expired',
    async () => {
      const response = await getWithToken(OWN_PROFILE_PATH, expiredEmployeeToken).expect(401);

      expect(response.body).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    },
    TEST_TIMEOUT_MS,
  );
});
