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
import { Test, type TestingModule } from '@nestjs/testing';
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
import {
  OWN_PHONE_SERVICE,
  type IOwnPhoneService,
} from '../src/profile/own-phone.service.interface.js';
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
const PHONE_NUMBER = '+6281234567890';
const PHOTO_KEY = '3f1b2c4d-0a9e-4b8f-8c7d-6e5f4a3b2c1d.jpg';
const PROFILE_NOT_FOUND_BODY = {
  statusCode: 404,
  code: 'NOT_FOUND',
  message: 'Employee profile not found.',
};
const VALIDATION_FAILED_CODE = 'VALIDATION_FAILED';

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

// Stands in for auth-service, which owns the accounts. An ID missing from the directory has no email, and an
// ID missing from the status map is an unknown account for the guard.
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

type StoredProfile = {
  readonly phoneNumber: string | null;
  readonly photoKey: string | null;
  readonly profileStatus: ProfileStatus;
};

describe('employee-service own phone update', () => {
  let container: StartedPostgreSqlContainer;
  let moduleRef: TestingModule;
  let app: INestApplication;
  let database: Database;
  let ownPhones: IOwnPhoneService;
  let employeeToken: string;
  let secondEmployeeToken: string;
  let hrToken: string;
  let unprovisionedToken: string;
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
    moduleRef = await Test.createTestingModule({
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
    ownPhones = moduleRef.get<IOwnPhoneService>(OWN_PHONE_SERVICE);

    const keys = employeeServiceAuthKeys();
    const expiresLater = nowInSeconds() + TOKEN_LIFETIME_SECONDS;
    employeeAccountId = registerAccount({ email: 'nadia.rahma@dexa.test', role: Role.EMPLOYEE });
    secondEmployeeAccountId = registerAccount({
      email: 'bima.saputra@dexa.test',
      role: Role.EMPLOYEE,
    });
    hrAccountId = registerAccount({ email: 'sari.lestari@dexa.test', role: Role.HR });
    const unprovisionedAccountId = registerAccount({
      email: 'new.hire@dexa.test',
      role: Role.EMPLOYEE,
    });

    await insertEmployee({
      accountId: employeeAccountId,
      name: 'Nadia Rahma',
      positionCode: 'FULLSTACK_DEVELOPER',
    });
    await insertEmployee({
      accountId: secondEmployeeAccountId,
      name: 'Bima Saputra',
      positionCode: 'FULLSTACK_DEVELOPER',
    });
    await insertEmployee({
      accountId: hrAccountId,
      name: 'Sari Lestari',
      positionCode: 'HR_OFFICER',
    });

    employeeToken = signUserToken(keys, employeeAccountId, Role.EMPLOYEE, expiresLater);
    secondEmployeeToken = signUserToken(keys, secondEmployeeAccountId, Role.EMPLOYEE, expiresLater);
    hrToken = signUserToken(keys, hrAccountId, Role.HR, expiresLater);
    unprovisionedToken = signUserToken(keys, unprovisionedAccountId, Role.EMPLOYEE, expiresLater);
  }, CONTAINER_TIMEOUT_MS);

  beforeEach(async () => {
    await setStoredProfile(employeeAccountId, {
      phoneNumber: null,
      photoKey: null,
      profileStatus: ProfileStatus.INCOMPLETE,
    });
    await setStoredProfile(secondEmployeeAccountId, {
      phoneNumber: '081234567890',
      photoKey: PHOTO_KEY,
      profileStatus: ProfileStatus.COMPLETE,
    });
  });

  function registerAccount(options: { email: string; role: Role }): string {
    const accountId = randomUUID();
    accountStatuses.set(accountId, { isActive: true });
    accountDirectory.set(accountId, { id: accountId, email: options.email, role: options.role });
    return accountId;
  }

  async function insertEmployee(options: {
    accountId: string;
    name: string;
    positionCode: string;
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
      profileStatus: ProfileStatus.INCOMPLETE,
      phoneNumber: null,
      photoKey: null,
    });
  }

  // Each test arranges the stored phone, photo, and status it needs before it acts.
  async function setStoredProfile(accountId: string, profile: StoredProfile): Promise<void> {
    await database.db.update(employees).set(profile).where(eq(employees.accountId, accountId));
  }

  async function readStoredRow(accountId: string) {
    const [row] = await database.db
      .select({
        phoneNumber: employees.phoneNumber,
        photoKey: employees.photoKey,
        profileStatus: employees.profileStatus,
        updatedAt: employees.updatedAt,
      })
      .from(employees)
      .where(eq(employees.accountId, accountId));
    if (row === undefined) throw new Error('The arranged employee row is missing.');
    return row;
  }

  function patchWithToken(accessToken: string, body: unknown) {
    return request(app.getHttpServer())
      .patch(OWN_PROFILE_PATH)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(body as object);
  }

  it(
    'should store the trimmed phone and keep the profile INCOMPLETE when the profile has no photo',
    async () => {
      const response = await patchWithToken(employeeToken, {
        phoneNumber: `  ${PHONE_NUMBER}  `,
      }).expect(200);

      expect(ownProfileSchema.parse(response.body)).toMatchObject<Partial<OwnProfile>>({
        accountId: employeeAccountId,
        phoneNumber: PHONE_NUMBER,
        photoUrl: null,
        profileStatus: ProfileStatus.INCOMPLETE,
      });
      const stored = await readStoredRow(employeeAccountId);
      expect(stored).toMatchObject({
        phoneNumber: PHONE_NUMBER,
        profileStatus: ProfileStatus.INCOMPLETE,
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should report only the phone number as changed when the profile has no photo',
    async () => {
      const changeSet = await ownPhones.updatePhone(employeeAccountId, {
        phoneNumber: PHONE_NUMBER,
      });

      expect(changeSet).toEqual({ changedFields: ['phoneNumber'] });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should set the profile COMPLETE when the phone is added to a profile that has a photo',
    async () => {
      await setStoredProfile(employeeAccountId, {
        phoneNumber: null,
        photoKey: PHOTO_KEY,
        profileStatus: ProfileStatus.INCOMPLETE,
      });

      const response = await patchWithToken(employeeToken, { phoneNumber: PHONE_NUMBER }).expect(
        200,
      );

      expect(response.body).toMatchObject({
        phoneNumber: PHONE_NUMBER,
        photoUrl: '/api/v1/employees/me/photo',
        profileStatus: ProfileStatus.COMPLETE,
      });
      expect(await readStoredRow(employeeAccountId)).toMatchObject({
        profileStatus: ProfileStatus.COMPLETE,
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should report the phone and the profile status as changed when the phone completes the profile',
    async () => {
      await setStoredProfile(employeeAccountId, {
        phoneNumber: null,
        photoKey: PHOTO_KEY,
        profileStatus: ProfileStatus.INCOMPLETE,
      });

      const changeSet = await ownPhones.updatePhone(employeeAccountId, {
        phoneNumber: PHONE_NUMBER,
      });

      expect(changeSet).toEqual({ changedFields: ['phoneNumber', 'profileStatus'] });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should clear the phone and set the profile INCOMPLETE when null is sent for a complete profile',
    async () => {
      await setStoredProfile(secondEmployeeAccountId, {
        phoneNumber: PHONE_NUMBER,
        photoKey: PHOTO_KEY,
        profileStatus: ProfileStatus.COMPLETE,
      });

      const response = await patchWithToken(secondEmployeeToken, { phoneNumber: null }).expect(200);

      expect(response.body).toMatchObject({
        phoneNumber: null,
        profileStatus: ProfileStatus.INCOMPLETE,
      });
      expect(await readStoredRow(secondEmployeeAccountId)).toMatchObject({
        phoneNumber: null,
        profileStatus: ProfileStatus.INCOMPLETE,
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should report the phone and the profile status as changed when the phone is cleared from a complete profile',
    async () => {
      await setStoredProfile(secondEmployeeAccountId, {
        phoneNumber: PHONE_NUMBER,
        photoKey: PHOTO_KEY,
        profileStatus: ProfileStatus.COMPLETE,
      });

      const changeSet = await ownPhones.updatePhone(secondEmployeeAccountId, { phoneNumber: null });

      expect(changeSet).toEqual({ changedFields: ['phoneNumber', 'profileStatus'] });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should write nothing and report no change when the stored phone is sent again',
    async () => {
      await setStoredProfile(employeeAccountId, {
        phoneNumber: PHONE_NUMBER,
        photoKey: null,
        profileStatus: ProfileStatus.INCOMPLETE,
      });

      const before = await readStoredRow(employeeAccountId);

      const response = await patchWithToken(employeeToken, { phoneNumber: PHONE_NUMBER }).expect(
        200,
      );
      const changeSet = await ownPhones.updatePhone(employeeAccountId, {
        phoneNumber: PHONE_NUMBER,
      });

      expect(response.body).toMatchObject({ phoneNumber: PHONE_NUMBER });
      expect(changeSet).toEqual({ changedFields: [] });
      expect(await readStoredRow(employeeAccountId)).toEqual(before);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should advance updated_at when the phone differs from the stored one',
    async () => {
      const before = await readStoredRow(employeeAccountId);

      await patchWithToken(employeeToken, { phoneNumber: PHONE_NUMBER }).expect(200);

      expect((await readStoredRow(employeeAccountId)).updatedAt).not.toEqual(before.updatedAt);
    },
    TEST_TIMEOUT_MS,
  );

  it.each([
    { field: 'name', value: 'Changed Name' },
    { field: 'email', value: 'changed@dexa.test' },
    { field: 'positionId', value: randomUUID() },
    { field: 'employeeStatusId', value: randomUUID() },
    { field: 'profileStatus', value: ProfileStatus.COMPLETE },
    { field: 'photoKey', value: PHOTO_KEY },
  ])(
    'should return 400 and write nothing when the body includes the read-only field $field',
    async ({ field, value }) => {
      const before = await readStoredRow(employeeAccountId);

      const response = await patchWithToken(employeeToken, {
        phoneNumber: PHONE_NUMBER,
        [field]: value,
      }).expect(400);

      expect(response.body).toMatchObject({ statusCode: 400, code: VALIDATION_FAILED_CODE });
      expect(await readStoredRow(employeeAccountId)).toEqual(before);
    },
    TEST_TIMEOUT_MS,
  );

  it.each([
    { condition: 'the phone is empty', body: { phoneNumber: '' } },
    { condition: 'the phone is whitespace only', body: { phoneNumber: '   ' } },
    { condition: 'the phone has letters', body: { phoneNumber: 'abc' } },
    { condition: 'the phone has too few digits', body: { phoneNumber: '+12' } },
    { condition: 'the phone has separators', body: { phoneNumber: '62-812-345' } },
    { condition: 'the phone key is missing', body: {} },
  ])(
    'should return 400 and write nothing when $condition',
    async ({ body }) => {
      const before = await readStoredRow(employeeAccountId);

      const response = await patchWithToken(employeeToken, body).expect(400);

      expect(response.body).toMatchObject({ statusCode: 400, code: VALIDATION_FAILED_CODE });
      expect(await readStoredRow(employeeAccountId)).toEqual(before);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 404 NOT_FOUND when the account has no employee profile',
    async () => {
      const response = await patchWithToken(unprovisionedToken, {
        phoneNumber: PHONE_NUMBER,
      }).expect(404);

      expect(response.body).toEqual(PROFILE_NOT_FOUND_BODY);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 401 UNAUTHORIZED when no bearer token is sent',
    async () => {
      const response = await request(app.getHttpServer())
        .patch(OWN_PROFILE_PATH)
        .send({ phoneNumber: PHONE_NUMBER })
        .expect(401);

      expect(response.body).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should update the phone of the HR account that signed in when an HR token is sent',
    async () => {
      const response = await patchWithToken(hrToken, { phoneNumber: '081234567890' }).expect(200);

      expect(response.body).toMatchObject({
        accountId: hrAccountId,
        phoneNumber: '081234567890',
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should leave another employee row unchanged when the signed-in employee updates the phone',
    async () => {
      const before = await readStoredRow(secondEmployeeAccountId);

      await patchWithToken(employeeToken, { phoneNumber: PHONE_NUMBER }).expect(200);

      expect(await readStoredRow(secondEmployeeAccountId)).toEqual(before);
    },
    TEST_TIMEOUT_MS,
  );
});
