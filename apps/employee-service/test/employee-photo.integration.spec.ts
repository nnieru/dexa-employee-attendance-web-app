import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configureApp, parseConfig, ServiceName } from '@dexa/common';
import { PHOTO_CONTENT_TYPE, ProfileStatus, Role } from '@dexa/contracts';
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
import type { AuthKeySet } from './auth-key-set.js';
import { signGatewayUserToken } from './gateway-user-token.js';
import {
  employeeServiceAuthKeys,
  employeeServiceEnvironment,
} from './employee-service-environment.js';

// Starting the container pulls an image on a cold machine, which exceeds Jest's 5 second default.
const CONTAINER_TIMEOUT_MS = 120_000;
const TEST_TIMEOUT_MS = 30_000;
const OWN_PHOTO_PATH = '/api/v1/employees/me/photo';
const EMPLOYEE_PHOTO_PATH = (accountId: string) => `/api/v1/employees/${accountId}/photo`;
const PHOTO_NOT_FOUND_BODY = {
  statusCode: 404,
  code: 'NOT_FOUND',
  message: 'Employee photo not found.',
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
const HR_PHOTO_KEY = '3f1b2c4d-0a9e-4b8f-8c7d-6e5f4a3b2c1d.jpg';
const EMPLOYEE_PHOTO_KEY = '7c2e9a10-5b3d-4f6e-9a8b-1c2d3e4f5a6b.jpg';
const PHONE_NUMBER = '081234567890';
// The stream does not decode its bytes, so a JPEG signature with a fixed body is enough to tell the photos apart.
const HR_PHOTO_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x48, 0x52]);
const EMPLOYEE_PHOTO_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x45, 0x4d]);

// The photo routes never reach Auth, so any call here is a bug in the route under test.
const unexpectedAuthClient: IAuthAccountClient = {
  findAccountById: () => Promise.reject(new Error('The photo routes do not read Auth.')),
  lookupAccounts: () => Promise.reject(new Error('The photo routes do not read Auth.')),
  searchAccountIdsByEmail: () => Promise.reject(new Error('The photo routes do not read Auth.')),
  findAccountReferenceByEmail: () =>
    Promise.reject(new Error('The photo routes do not read Auth.')),
};

// Signs the token that api-gateway sends to this service for the user (D-51).
function signUserToken(keys: AuthKeySet, accountId: string, role: Role): string {
  return signGatewayUserToken(keys, ServiceName.EMPLOYEE_SERVICE, accountId, role);
}

describe('employee-service employee photo for HR', () => {
  let container: StartedPostgreSqlContainer;
  let moduleRef: TestingModule;
  let app: INestApplication;
  let database: Database;
  let photoDirectory: string;
  let hrAccountId: string;
  let employeeAccountId: string;
  let withoutPhotoAccountId: string;
  let hrToken: string;
  let employeeToken: string;

  afterAll(async () => {
    await app?.close();
    await container?.stop();
    if (photoDirectory !== undefined) await rm(photoDirectory, { recursive: true, force: true });
  }, CONTAINER_TIMEOUT_MS);

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18').start();
    photoDirectory = await mkdtemp(join(tmpdir(), 'employee-photo-hr-spec-'));
    const config = parseConfig(
      EmployeeServiceConfigSchema,
      employeeServiceEnvironment({
        EMPLOYEE_DATABASE_URL: container.getConnectionUri(),
        EMPLOYEE_MASTER_DATA: JSON.stringify(SEED_DOCUMENT),
        EMPLOYEE_PHOTO_DIRECTORY: photoDirectory,
      }),
    );
    moduleRef = await Test.createTestingModule({
      imports: [createAppModule(config)],
    })
      .overrideProvider(AUTH_ACCOUNT_CLIENT)
      .useValue(unexpectedAuthClient)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app, { CORS_ORIGINS: [] });
    await app.init();
    database = moduleRef.get<Database>(DATABASE);

    hrAccountId = registerAccount();
    employeeAccountId = registerAccount();
    withoutPhotoAccountId = registerAccount();
    await insertEmployee(hrAccountId, 'Sari Lestari', 'HR_OFFICER', HR_PHOTO_KEY);
    await insertEmployee(
      employeeAccountId,
      'Adi Pratama',
      'FULLSTACK_DEVELOPER',
      EMPLOYEE_PHOTO_KEY,
    );
    await insertEmployee(withoutPhotoAccountId, 'Bima Saputra', 'FULLSTACK_DEVELOPER', null);
    await writeFile(join(photoDirectory, HR_PHOTO_KEY), HR_PHOTO_BYTES);
    await writeFile(join(photoDirectory, EMPLOYEE_PHOTO_KEY), EMPLOYEE_PHOTO_BYTES);

    const keys = employeeServiceAuthKeys();
    hrToken = signUserToken(keys, hrAccountId, Role.HR);
    employeeToken = signUserToken(keys, employeeAccountId, Role.EMPLOYEE);
  }, CONTAINER_TIMEOUT_MS);

  function registerAccount(): string {
    const accountId = randomUUID();
    return accountId;
  }

  async function insertEmployee(
    accountId: string,
    name: string,
    positionCode: string,
    photoKey: string | null,
  ): Promise<void> {
    const [position] = await database.db
      .select({ id: masterPositions.id })
      .from(masterPositions)
      .where(eq(masterPositions.code, positionCode));
    const [status] = await database.db
      .select({ id: masterEmployeeStatuses.id })
      .from(masterEmployeeStatuses)
      .where(eq(masterEmployeeStatuses.code, 'ACTIVE'));
    if (position === undefined || status === undefined) {
      throw new Error('The master seed did not insert the rows this test needs.');
    }
    const hasPhoto = photoKey !== null;
    await database.db.insert(employees).values({
      accountId,
      name,
      positionId: position.id,
      employeeStatusId: status.id,
      profileStatus: hasPhoto ? ProfileStatus.COMPLETE : ProfileStatus.INCOMPLETE,
      phoneNumber: hasPhoto ? PHONE_NUMBER : null,
      photoKey,
    });
  }

  // A refusal is JSON, so this request parses the body as JSON instead of collecting bytes.
  function getJson(path: string, accessToken: string) {
    return request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${accessToken}`);
  }

  // The photo answer is bytes, so the body is collected rather than parsed.
  function getPhoto(path: string, accessToken: string) {
    return request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${accessToken}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('error', (error: Error) => callback(error, Buffer.alloc(0)));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });
  }

  it(
    'should return another employee photo bytes with the private photo headers when HR asks for it',
    async () => {
      const response = await getPhoto(EMPLOYEE_PHOTO_PATH(employeeAccountId), hrToken).expect(200);

      expect(response.headers['content-type']).toBe(PHOTO_CONTENT_TYPE);
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      const body: unknown = response.body;
      expect(Buffer.isBuffer(body) && body.equals(EMPLOYEE_PHOTO_BYTES)).toBe(true);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 403 when an employee asks for another employee photo',
    async () => {
      const response = await getJson(EMPLOYEE_PHOTO_PATH(hrAccountId), employeeToken).expect(403);

      expect(response.body).toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 404 when HR asks for a UUID that has no profile',
    async () => {
      const response = await getJson(EMPLOYEE_PHOTO_PATH(randomUUID()), hrToken).expect(404);

      expect(response.body).toEqual(PHOTO_NOT_FOUND_BODY);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 404 when HR asks for an employee who has no photo',
    async () => {
      const response = await getJson(EMPLOYEE_PHOTO_PATH(withoutPhotoAccountId), hrToken).expect(
        404,
      );

      expect(response.body).toEqual(PHOTO_NOT_FOUND_BODY);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 400 when the account segment is not a UUID',
    async () => {
      const response = await getJson('/api/v1/employees/not-a-uuid/photo', hrToken).expect(400);

      expect(response.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return the caller own photo on the static me route when HR asks for it',
    async () => {
      const response = await getPhoto(OWN_PHOTO_PATH, hrToken).expect(200);

      const body: unknown = response.body;
      expect(Buffer.isBuffer(body) && body.equals(HR_PHOTO_BYTES)).toBe(true);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return the caller own photo on the static me route when an employee asks for it',
    async () => {
      const response = await getPhoto(OWN_PHOTO_PATH, employeeToken).expect(200);

      const body: unknown = response.body;
      expect(Buffer.isBuffer(body) && body.equals(EMPLOYEE_PHOTO_BYTES)).toBe(true);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 401 when no bearer token is sent',
    async () => {
      await request(app.getHttpServer()).get(EMPLOYEE_PHOTO_PATH(employeeAccountId)).expect(401);
    },
    TEST_TIMEOUT_MS,
  );
});
