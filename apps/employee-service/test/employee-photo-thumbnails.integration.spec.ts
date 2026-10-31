import { jest } from '@jest/globals';
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configureApp, parseConfig, ServiceName } from '@dexa/common';
import {
  photoThumbnailResponseSchema,
  PHOTO_THUMBNAIL_DATA_URL_PREFIX,
  PHOTO_THUMBNAIL_MAX_ACCOUNT_IDS,
  PHOTO_THUMBNAIL_SIZE,
  ProfileStatus,
  Role,
} from '@dexa/contracts';
import type { Database } from '@dexa/db';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import sharp, { type Metadata } from 'sharp';
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
import { PHOTO_THUMBNAIL_PROCESSOR } from '../src/photo/photo-thumbnail-processor.interface.js';
import type { IPhotoThumbnailProcessor } from '../src/photo/photo-thumbnail-processor.interface.js';
import type { AuthKeySet } from './auth-key-set.js';
import {
  forgeGatewayUserToken,
  signEndUserJwt,
  signGatewayUserToken,
} from './gateway-user-token.js';
import {
  employeeServiceAuthKeys,
  employeeServiceEnvironment,
} from './employee-service-environment.js';

// Starting the container pulls an image on a cold machine, which exceeds Jest's 5 second default.
const CONTAINER_TIMEOUT_MS = 120_000;
const TEST_TIMEOUT_MS = 30_000;
const THUMBNAIL_PATH = '/api/v1/employees/photo-thumbnails';
const OWN_PHOTO_PATH = '/api/v1/employees/me/photo';
const CACHE_SUFFIX = '.thumb.jpg';
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
const PHONE_NUMBER = '081234567890';
// Used twice in one request, so it is defined before the tests that name it.
const REPEATED_ACCOUNT_ID = randomUUID();

// Only the own-photo replacement reads Auth, for the email in the profile it returns. Every other route here never
// reaches Auth, so the lookups below reject and fail the test if a thumbnail route starts calling Auth.
const fakeAuthAccountClient: IAuthAccountClient = {
  findAccountById: (accountId) =>
    Promise.resolve({ id: accountId, email: 'employee.one@dexa.test', role: Role.EMPLOYEE }),
  lookupAccounts: () => Promise.reject(new Error('The thumbnail routes do not look up accounts.')),
  searchAccountIdsByEmail: () =>
    Promise.reject(new Error('The thumbnail routes do not search accounts.')),
  findAccountReferenceByEmail: () =>
    Promise.reject(new Error('The thumbnail routes do not find accounts by email.')),
};

function uuidsOf(count: number): string[] {
  return Array.from({ length: count }, (_, index) => {
    const suffix = index.toString(16).padStart(12, '0');
    return `5f0c1f3e-8d2a-4b7e-9c61-${suffix}`;
  });
}

// A distinct solid colour per photo, so a test can tell which stored file a thumbnail came from.
async function jpegPhoto(background: string): Promise<Buffer> {
  return sharp({ create: { width: 200, height: 120, channels: 3, background } })
    .jpeg()
    .toBuffer();
}

async function pngPhoto(background: string): Promise<Buffer> {
  return sharp({ create: { width: 160, height: 90, channels: 3, background } })
    .png()
    .toBuffer();
}

describe('employee-service photo thumbnails for HR', () => {
  let container: StartedPostgreSqlContainer;
  let moduleRef: TestingModule;
  let app: INestApplication;
  let database: Database;
  let processor: IPhotoThumbnailProcessor;
  let photoDirectory: string;
  let keys: AuthKeySet;
  let hrAccountId: string;
  let employeeAccountId: string;
  let hrToken: string;
  let employeeToken: string;

  afterAll(async () => {
    await app?.close();
    await container?.stop();
    if (photoDirectory !== undefined) await rm(photoDirectory, { recursive: true, force: true });
  }, CONTAINER_TIMEOUT_MS);

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18').start();
    photoDirectory = await mkdtemp(join(tmpdir(), 'employee-photo-thumbnails-spec-'));
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
      .useValue(fakeAuthAccountClient)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app, { CORS_ORIGINS: [] });
    await app.init();
    database = moduleRef.get<Database>(DATABASE);
    processor = moduleRef.get<IPhotoThumbnailProcessor>(PHOTO_THUMBNAIL_PROCESSOR);

    keys = employeeServiceAuthKeys();
    hrAccountId = await createEmployeeWithPhoto('Sari Lestari', 'HR_OFFICER', '#802020');
    employeeAccountId = await createEmployeeWithPhoto(
      'Adi Pratama',
      'FULLSTACK_DEVELOPER',
      '#208040',
    );
    hrToken = signGatewayUserToken(keys, ServiceName.EMPLOYEE_SERVICE, hrAccountId, Role.HR);
    employeeToken = signGatewayUserToken(
      keys,
      ServiceName.EMPLOYEE_SERVICE,
      employeeAccountId,
      Role.EMPLOYEE,
    );
  }, CONTAINER_TIMEOUT_MS);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Inserts an employee and a JPEG file for the photo. The colour tells the photos apart.
  async function createEmployeeWithPhoto(
    name: string,
    positionCode: string,
    background: string,
  ): Promise<string> {
    const photoKey = `${randomUUID()}.jpg`;
    await writeFile(join(photoDirectory, photoKey), await jpegPhoto(background));
    return insertEmployee(name, positionCode, photoKey);
  }

  async function createEmployeeWithoutPhoto(name: string, positionCode: string): Promise<string> {
    return insertEmployee(name, positionCode, null);
  }

  async function insertEmployee(
    name: string,
    positionCode: string,
    photoKey: string | null,
  ): Promise<string> {
    const accountId = randomUUID();
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
    return accountId;
  }

  async function storedPhotoKeyOf(accountId: string): Promise<string | null> {
    const [row] = await database.db
      .select({ photoKey: employees.photoKey })
      .from(employees)
      .where(eq(employees.accountId, accountId));
    return row?.photoKey ?? null;
  }

  function requestThumbnails(accountIds: unknown, accessToken: string) {
    return request(app.getHttpServer())
      .post(THUMBNAIL_PATH)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ accountIds } as object);
  }

  async function decodedThumbnailMetadata(thumbnail: string): Promise<Metadata> {
    const base64 = thumbnail.slice(PHOTO_THUMBNAIL_DATA_URL_PREFIX.length);
    return sharp(Buffer.from(base64, 'base64')).metadata();
  }

  it(
    'should return one thumbnail per employee with a photo, in request order, when HR asks for several employees',
    async () => {
      const withoutPhotoAccountId = await createEmployeeWithoutPhoto(
        'Bima Saputra',
        'FULLSTACK_DEVELOPER',
      );

      const response = await requestThumbnails(
        [withoutPhotoAccountId, employeeAccountId, randomUUID(), hrAccountId],
        hrToken,
      ).expect(200);

      const page = photoThumbnailResponseSchema.parse(response.body);
      expect(page.items.map((item) => item.accountId)).toEqual([employeeAccountId, hrAccountId]);
      for (const item of page.items) {
        expect(item.thumbnail.startsWith(PHOTO_THUMBNAIL_DATA_URL_PREFIX)).toBe(true);
        const metadata = await decodedThumbnailMetadata(item.thumbnail);
        expect(metadata.format).toBe('jpeg');
        expect([metadata.width, metadata.height]).toEqual([
          PHOTO_THUMBNAIL_SIZE,
          PHOTO_THUMBNAIL_SIZE,
        ]);
        expect(metadata.exif).toBeUndefined();
      }
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should reuse the cached thumbnails without decoding the photos again when the same employees are requested again',
    async () => {
      const accountId = await createEmployeeWithPhoto(
        'Citra Dewi',
        'FULLSTACK_DEVELOPER',
        '#4040a0',
      );
      const photoKey = await storedPhotoKeyOf(accountId);
      const cachePath = join(photoDirectory, `${photoKey}${CACHE_SUFFIX}`);
      const createThumbnail = jest.spyOn(processor, 'createThumbnail');

      const first = await requestThumbnails([accountId], hrToken).expect(200);
      const cacheModifiedAtFirst = (await stat(cachePath)).mtimeMs;
      const second = await requestThumbnails([accountId], hrToken).expect(200);

      expect(createThumbnail).toHaveBeenCalledTimes(1);
      expect(second.body).toEqual(first.body);
      expect((await stat(cachePath)).mtimeMs).toBe(cacheModifiedAtFirst);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should omit an employee whose stored file is missing and still return the other employees',
    async () => {
      const missingFileAccountId = await insertEmployee(
        'Dewi Anggraini',
        'FULLSTACK_DEVELOPER',
        `${randomUUID()}.jpg`,
      );

      const response = await requestThumbnails([missingFileAccountId, hrAccountId], hrToken).expect(
        200,
      );

      expect(
        photoThumbnailResponseSchema.parse(response.body).items.map((item) => item.accountId),
      ).toEqual([hrAccountId]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should remove the cached thumbnail with the old photo when the employee replaces the photo',
    async () => {
      const accountId = await createEmployeeWithPhoto(
        'Eka Putra',
        'FULLSTACK_DEVELOPER',
        '#a06020',
      );
      const accessToken = signGatewayUserToken(
        keys,
        ServiceName.EMPLOYEE_SERVICE,
        accountId,
        Role.EMPLOYEE,
      );
      const oldKey = await storedPhotoKeyOf(accountId);
      await requestThumbnails([accountId], hrToken).expect(200);
      expect(await readdir(photoDirectory)).toContain(`${oldKey}${CACHE_SUFFIX}`);

      await request(app.getHttpServer())
        .put(OWN_PHOTO_PATH)
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('photo', await pngPhoto('#206060'), {
          filename: 'photo.png',
          contentType: 'image/png',
        })
        .expect(200);

      const newKey = await storedPhotoKeyOf(accountId);
      expect(newKey).not.toBe(oldKey);
      const files = await readdir(photoDirectory);
      expect(files).not.toContain(oldKey);
      expect(files).not.toContain(`${oldKey}${CACHE_SUFFIX}`);
      const response = await requestThumbnails([accountId], hrToken).expect(200);
      expect(photoThumbnailResponseSchema.parse(response.body).items).toHaveLength(1);
      expect(await readdir(photoDirectory)).toContain(`${newKey}${CACHE_SUFFIX}`);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 403 FORBIDDEN when an employee token asks for thumbnails',
    async () => {
      const response = await requestThumbnails([hrAccountId], employeeToken).expect(403);

      expect(response.body).toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 200 with no items when the request names 100 accounts that have no profile',
    async () => {
      const response = await requestThumbnails(
        uuidsOf(PHOTO_THUMBNAIL_MAX_ACCOUNT_IDS),
        hrToken,
      ).expect(200);

      expect(response.body).toEqual({ items: [] });
    },
    TEST_TIMEOUT_MS,
  );

  it.each([
    {
      condition: 'the list has more than 100 IDs',
      accountIds: uuidsOf(PHOTO_THUMBNAIL_MAX_ACCOUNT_IDS + 1),
    },
    { condition: 'an ID appears twice', accountIds: [REPEATED_ACCOUNT_ID, REPEATED_ACCOUNT_ID] },
    { condition: 'the list is empty', accountIds: [] },
    { condition: 'an ID is not a UUID', accountIds: ['not-a-uuid'] },
  ])(
    'should return 400 VALIDATION_FAILED when $condition',
    async ({ accountIds }) => {
      const response = await requestThumbnails(accountIds, hrToken).expect(400);

      expect(response.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
    },
    TEST_TIMEOUT_MS,
  );

  it.each([
    {
      condition: 'a forged token names api-gateway but another service key signs it',
      token: () => forgeGatewayUserToken(keys, ServiceName.EMPLOYEE_SERVICE, hrAccountId, Role.HR),
    },
    {
      condition: 'an end-user JWT is sent instead of a gateway token',
      token: () => signEndUserJwt(keys, hrAccountId, Role.HR),
    },
  ])(
    'should return 401 UNAUTHORIZED when $condition',
    async ({ token }) => {
      const response = await requestThumbnails([hrAccountId], token()).expect(401);

      expect(response.body).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 401 UNAUTHORIZED when no bearer token is sent',
    async () => {
      await request(app.getHttpServer())
        .post(THUMBNAIL_PATH)
        .send({ accountIds: [hrAccountId] })
        .expect(401);
    },
    TEST_TIMEOUT_MS,
  );
});
