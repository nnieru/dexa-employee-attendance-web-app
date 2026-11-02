import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configureApp, parseConfig, ServiceName } from '@dexa/common';
import {
  ErrorCode,
  ownProfileSchema,
  ProfileStatus,
  Role,
  type AccountLookupItem,
  type OwnProfile,
} from '@dexa/contracts';
import type { Database } from '@dexa/db';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import sharp, { type Sharp } from 'sharp';
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
  OWN_PHOTO_SERVICE,
  type IOwnPhotoService,
} from '../src/photo/own-photo.service.interface.js';
import type { AuthKeySet } from './auth-key-set.js';
import { signGatewayUserToken } from './gateway-user-token.js';
import {
  employeeServiceAuthKeys,
  employeeServiceEnvironment,
} from './employee-service-environment.js';

// The lifetime of the token api-gateway sends for a call.
const TOKEN_LIFETIME_SECONDS = 60;

// Starting the container pulls an image on a cold machine, which exceeds Jest's 5 second default.
const CONTAINER_TIMEOUT_MS = 120_000;
const TEST_TIMEOUT_MS = 30_000;
const OWN_PHOTO_PATH = '/api/v1/employees/me/photo';
const OWN_PROFILE_PATH = '/api/v1/employees/me';
const PHOTO_URL = '/api/v1/employees/me/photo';
const PHONE_NUMBER = '+6281234567890';
const HR_PHONE_NUMBER = '081234567890';
const PHOTO_KEY_PATTERN = /^[0-9a-f-]{36}\.jpg$/;
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const MEBIBYTE = 1024 * 1024;
const PHOTO_MAX_DIMENSION = 1024;
const HR_PHOTO_KEY = '3f1b2c4d-0a9e-4b8f-8c7d-6e5f4a3b2c1d.jpg';
// A 1x1 GIF, which the photo rules refuse by its decoded format.
const GIF_BYTES = Buffer.from(
  'R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==',
  'base64',
);
const PROFILE_NOT_FOUND_BODY = {
  statusCode: 404,
  code: 'NOT_FOUND',
  message: 'Employee profile not found.',
};
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

// Stands in for auth-service, which owns the accounts. An ID missing from the directory has no email, and an
// ID missing from the status map is an unknown account for the guard.
const accountDirectory = new Map<string, AccountLookupItem>();
const fakeAuthAccountClient: IAuthAccountClient = {
  findAccountById: (accountId) => Promise.resolve(accountDirectory.get(accountId)),
  lookupAccounts: (accountIds) =>
    Promise.resolve(accountIds.flatMap((accountId) => accountDirectory.get(accountId) ?? [])),
  searchAccountIdsByEmail: () => Promise.reject(new Error('These specs do not search accounts.')),
  // These specs do not run the HR profile bootstrap, so no email lookup is expected.
  findAccountReferenceByEmail: () => Promise.resolve(undefined),
};

type StoredProfile = {
  readonly phoneNumber: string | null;
  readonly photoKey: string | null;
  readonly profileStatus: ProfileStatus;
};

// Signs the token that api-gateway sends to this service for the user.
function signUserToken(
  keys: AuthKeySet,
  accountId: string,
  role: Role,
  expiresAtSeconds: number,
): string {
  return signGatewayUserToken(
    keys,
    ServiceName.EMPLOYEE_SERVICE,
    accountId,
    role,
    expiresAtSeconds,
  );
}

function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

// Fixtures are generated here rather than committed, so the bytes under test are visible in the spec.
function solidImage(width: number, height: number): Sharp {
  return sharp({ create: { width, height, channels: 3, background: '#2d6a4f' } });
}

describe('employee-service own photo', () => {
  let container: StartedPostgreSqlContainer;
  let moduleRef: TestingModule;
  let app: INestApplication;
  let database: Database;
  let ownPhotos: IOwnPhotoService;
  let photoDirectory: string;
  let hrPhotoBytes: Buffer;
  let employeeToken: string;
  let secondEmployeeToken: string;
  let hrToken: string;
  let unprovisionedToken: string;
  let employeeAccountId: string;
  let secondEmployeeAccountId: string;
  let hrAccountId: string;
  let unprovisionedAccountId: string;

  afterAll(async () => {
    await app?.close();
    await container?.stop();
    if (photoDirectory !== undefined) await rm(photoDirectory, { recursive: true, force: true });
  }, CONTAINER_TIMEOUT_MS);

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18').start();
    photoDirectory = await mkdtemp(join(tmpdir(), 'employee-photos-spec-'));
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
    ownPhotos = moduleRef.get<IOwnPhotoService>(OWN_PHOTO_SERVICE);

    const keys = employeeServiceAuthKeys();
    const expiresLater = nowInSeconds() + TOKEN_LIFETIME_SECONDS;
    employeeAccountId = registerAccount({ email: 'nadia.rahma@dexa.test', role: Role.EMPLOYEE });
    secondEmployeeAccountId = registerAccount({
      email: 'bima.saputra@dexa.test',
      role: Role.EMPLOYEE,
    });
    hrAccountId = registerAccount({ email: 'sari.lestari@dexa.test', role: Role.HR });
    unprovisionedAccountId = registerAccount({
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

    hrPhotoBytes = await solidImage(64, 64).jpeg().toBuffer();

    employeeToken = signUserToken(keys, employeeAccountId, Role.EMPLOYEE, expiresLater);
    secondEmployeeToken = signUserToken(keys, secondEmployeeAccountId, Role.EMPLOYEE, expiresLater);
    hrToken = signUserToken(keys, hrAccountId, Role.HR, expiresLater);
    unprovisionedToken = signUserToken(keys, unprovisionedAccountId, Role.EMPLOYEE, expiresLater);
  }, CONTAINER_TIMEOUT_MS);

  // Each test starts from the same stored profiles and an photo directory that holds only the HR photo.
  beforeEach(async () => {
    await clearPhotoDirectory();
    await writeFile(join(photoDirectory, HR_PHOTO_KEY), hrPhotoBytes);
    await setStoredProfile(employeeAccountId, {
      phoneNumber: PHONE_NUMBER,
      photoKey: null,
      profileStatus: ProfileStatus.INCOMPLETE,
    });
    await setStoredProfile(secondEmployeeAccountId, {
      phoneNumber: null,
      photoKey: null,
      profileStatus: ProfileStatus.INCOMPLETE,
    });
    await setStoredProfile(hrAccountId, {
      phoneNumber: HR_PHONE_NUMBER,
      photoKey: HR_PHOTO_KEY,
      profileStatus: ProfileStatus.COMPLETE,
    });
  });

  async function clearPhotoDirectory(): Promise<void> {
    for (const name of await readdir(photoDirectory)) {
      await rm(join(photoDirectory, name), { force: true });
    }
  }

  function registerAccount(options: { email: string; role: Role }): string {
    const accountId = randomUUID();
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

  async function setStoredProfile(accountId: string, profile: StoredProfile): Promise<void> {
    await database.db.update(employees).set(profile).where(eq(employees.accountId, accountId));
  }

  async function readStoredRow(accountId: string) {
    const [row] = await database.db
      .select({
        phoneNumber: employees.phoneNumber,
        photoKey: employees.photoKey,
        profileStatus: employees.profileStatus,
      })
      .from(employees)
      .where(eq(employees.accountId, accountId));
    if (row === undefined) throw new Error('The arranged employee row is missing.');
    return row;
  }

  function uploadPhoto(
    accessToken: string,
    bytes: Buffer,
    options: { filename: string; contentType: string } = {
      filename: 'photo.png',
      contentType: 'image/png',
    },
  ) {
    return request(app.getHttpServer())
      .put(OWN_PHOTO_PATH)
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('photo', bytes, options);
  }

  function getPhotoBytes(accessToken: string) {
    return request(app.getHttpServer())
      .get(OWN_PHOTO_PATH)
      .set('Authorization', `Bearer ${accessToken}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('error', (error: Error) => callback(error, Buffer.alloc(0)));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });
  }

  // The photo request parses every answer as bytes, so a JSON error body is decoded here.
  function readJsonBody(body: unknown): unknown {
    if (!Buffer.isBuffer(body)) return body;
    const parsed: unknown = JSON.parse(body.toString('utf8'));
    return parsed;
  }

  async function storedPhotoBytes(photoKey: string): Promise<Buffer> {
    return readFile(join(photoDirectory, photoKey));
  }

  it(
    'should store a metadata-free JPEG within 1024 by 1024 and set the photo URL when a PNG is uploaded',
    async () => {
      const png = await solidImage(300, 200).png().toBuffer();

      const response = await uploadPhoto(employeeToken, png).expect(200);

      expect(ownProfileSchema.parse(response.body)).toMatchObject<Partial<OwnProfile>>({
        accountId: employeeAccountId,
        photoUrl: PHOTO_URL,
      });
      const stored = await readStoredRow(employeeAccountId);
      expect(stored.photoKey).toMatch(PHOTO_KEY_PATTERN);
      const bytes = await storedPhotoBytes(stored.photoKey ?? '');
      expect(bytes.subarray(0, JPEG_SIGNATURE.length).equals(JPEG_SIGNATURE)).toBe(true);
      const metadata = await sharp(bytes).metadata();
      expect(metadata.format).toBe('jpeg');
      expect(metadata.exif).toBeUndefined();
      expect([metadata.width, metadata.height]).toEqual([300, 200]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should fit a 3000 by 2000 JPEG inside 1024 by 1024 and keep its aspect ratio',
    async () => {
      const large = await solidImage(3000, 2000).jpeg().toBuffer();

      await uploadPhoto(employeeToken, large, {
        filename: 'large.jpg',
        contentType: 'image/jpeg',
      }).expect(200);

      const stored = await readStoredRow(employeeAccountId);
      const metadata = await sharp(await storedPhotoBytes(stored.photoKey ?? '')).metadata();
      expect(metadata.width).toBe(PHOTO_MAX_DIMENSION);
      expect(metadata.height).toBe(Math.round((PHOTO_MAX_DIMENSION * 2000) / 3000));
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 400 PHOTO_INVALID and keep the stored photo when a text file is named as a JPEG',
    async () => {
      const before = await readStoredRow(employeeAccountId);

      const response = await uploadPhoto(employeeToken, Buffer.from('This is not a photo.'), {
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
      }).expect(400);

      expect(response.body).toMatchObject({ statusCode: 400, code: ErrorCode.PHOTO_INVALID });
      expect(await readdir(photoDirectory)).toEqual([HR_PHOTO_KEY]);
      expect(await readStoredRow(employeeAccountId)).toEqual(before);
    },
    TEST_TIMEOUT_MS,
  );

  it.each([
    {
      format: 'GIF',
      createBytes: () => Promise.resolve(GIF_BYTES),
      filename: 'photo.gif',
      contentType: 'image/gif',
    },
    {
      format: 'WebP',
      createBytes: () => solidImage(64, 64).webp().toBuffer(),
      filename: 'photo.webp',
      contentType: 'image/webp',
    },
  ])(
    'should return 400 PHOTO_INVALID when the content is a $format',
    async ({ createBytes, filename, contentType }) => {
      const content = await createBytes();

      const response = await uploadPhoto(employeeToken, content, { filename, contentType }).expect(
        400,
      );

      expect(response.body).toMatchObject({ code: ErrorCode.PHOTO_INVALID });
      expect(await readdir(photoDirectory)).toEqual([HR_PHOTO_KEY]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 400 PHOTO_INVALID when the image is above 16 million pixels',
    async () => {
      const oversizedPixels = await solidImage(5000, 4000).png().toBuffer();

      const response = await uploadPhoto(employeeToken, oversizedPixels).expect(400);

      expect(response.body).toMatchObject({ code: ErrorCode.PHOTO_INVALID });
      expect(await readdir(photoDirectory)).toEqual([HR_PHOTO_KEY]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 413 PHOTO_TOO_LARGE before the body is read when the declared length is over the limit',
    async () => {
      const tooLarge = Buffer.alloc(5 * MEBIBYTE + 128 * 1024, 0x61);

      const response = await uploadPhoto(employeeToken, tooLarge, {
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
      }).expect(413);

      expect(response.body).toMatchObject({ statusCode: 413, code: ErrorCode.PHOTO_TOO_LARGE });
      expect(await readdir(photoDirectory)).toEqual([HR_PHOTO_KEY]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 413 PHOTO_TOO_LARGE when the photo file itself is one byte over 5 MiB',
    async () => {
      const oneByteOver = Buffer.alloc(5 * MEBIBYTE + 1, 0x61);

      const response = await uploadPhoto(employeeToken, oneByteOver, {
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
      }).expect(413);

      expect(response.body).toMatchObject({ code: ErrorCode.PHOTO_TOO_LARGE });
      expect(await readdir(photoDirectory)).toEqual([HR_PHOTO_KEY]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should keep only the new photo file and remove the replaced one when the photo is replaced',
    async () => {
      const first = await solidImage(120, 120).png().toBuffer();
      const second = await solidImage(160, 90).png().toBuffer();
      await uploadPhoto(employeeToken, first).expect(200);
      const firstKey = (await readStoredRow(employeeAccountId)).photoKey;

      await uploadPhoto(employeeToken, second).expect(200);

      const currentKey = (await readStoredRow(employeeAccountId)).photoKey;
      expect(currentKey).toMatch(PHOTO_KEY_PATTERN);
      expect(currentKey).not.toBe(firstKey);
      expect((await readdir(photoDirectory)).sort()).toEqual(
        [HR_PHOTO_KEY, currentKey ?? ''].sort(),
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should set the profile COMPLETE when the employee already has a phone',
    async () => {
      const response = await uploadPhoto(
        employeeToken,
        await solidImage(64, 64).png().toBuffer(),
      ).expect(200);

      expect(response.body).toMatchObject({
        phoneNumber: PHONE_NUMBER,
        photoUrl: PHOTO_URL,
        profileStatus: ProfileStatus.COMPLETE,
      });
      expect(await readStoredRow(employeeAccountId)).toMatchObject({
        profileStatus: ProfileStatus.COMPLETE,
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should report the photo and the profile status as changed when the photo completes the profile',
    async () => {
      const changeSet = await ownPhotos.replacePhoto(
        employeeAccountId,
        await solidImage(64, 64).jpeg().toBuffer(),
      );

      expect(changeSet).toEqual({ changedFields: ['photo', 'profileStatus'] });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should report only the photo when the profile status does not change',
    async () => {
      const changeSet = await ownPhotos.replacePhoto(
        secondEmployeeAccountId,
        await solidImage(64, 64).jpeg().toBuffer(),
      );

      expect(changeSet).toEqual({ changedFields: ['photo'] });
      expect(await readStoredRow(secondEmployeeAccountId)).toMatchObject({
        profileStatus: ProfileStatus.INCOMPLETE,
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return the stored JPEG with private headers when the owner fetches their photo',
    async () => {
      await uploadPhoto(employeeToken, await solidImage(64, 48).png().toBuffer()).expect(200);
      const stored = await readStoredRow(employeeAccountId);
      const expectedBytes = await storedPhotoBytes(stored.photoKey ?? '');

      const response = await getPhotoBytes(employeeToken).expect(200);

      expect(response.headers['content-type']).toBe('image/jpeg');
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      const body: unknown = response.body;
      expect(Buffer.isBuffer(body) && body.equals(expectedBytes)).toBe(true);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 404 NOT_FOUND when the employee has no photo',
    async () => {
      const response = await getPhotoBytes(secondEmployeeToken).expect(404);

      expect(readJsonBody(response.body)).toEqual(PHOTO_NOT_FOUND_BODY);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return only the requester own photo when another employee has one',
    async () => {
      const response = await getPhotoBytes(secondEmployeeToken).expect(404);
      expect(readJsonBody(response.body)).toEqual(PHOTO_NOT_FOUND_BODY);

      const hrResponse = await getPhotoBytes(hrToken).expect(200);
      const body: unknown = hrResponse.body;
      expect(Buffer.isBuffer(body) && body.equals(hrPhotoBytes)).toBe(true);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 404 NOT_FOUND when the stored file for the photo key is missing',
    async () => {
      await setStoredProfile(secondEmployeeAccountId, {
        phoneNumber: null,
        photoKey: HR_PHOTO_KEY,
        profileStatus: ProfileStatus.INCOMPLETE,
      });
      await rm(join(photoDirectory, HR_PHOTO_KEY), { force: true });

      const response = await getPhotoBytes(secondEmployeeToken).expect(404);

      expect(readJsonBody(response.body)).toEqual(PHOTO_NOT_FOUND_BODY);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 401 UNAUTHORIZED on the photo routes when no bearer token is sent',
    async () => {
      const getResponse = await request(app.getHttpServer()).get(OWN_PHOTO_PATH).expect(401);
      const putResponse = await request(app.getHttpServer())
        .put(OWN_PHOTO_PATH)
        .attach('photo', await solidImage(32, 32).png().toBuffer(), 'photo.png')
        .expect(401);

      expect(getResponse.body).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
      expect(putResponse.body).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
      expect(await readdir(photoDirectory)).toEqual([HR_PHOTO_KEY]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 404 PROFILE_NOT_FOUND, leaving no file, when the account has no employee profile',
    async () => {
      const response = await uploadPhoto(
        unprovisionedToken,
        await solidImage(64, 64).png().toBuffer(),
      ).expect(404);

      expect(response.body).toEqual(PROFILE_NOT_FOUND_BODY);
      expect(await readdir(photoDirectory)).toEqual([HR_PHOTO_KEY]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should replace the HR photo and remove its previous file when an HR account uploads its photo',
    async () => {
      const response = await uploadPhoto(hrToken, await solidImage(40, 40).png().toBuffer()).expect(
        200,
      );

      expect(response.body).toMatchObject({
        accountId: hrAccountId,
        photoUrl: PHOTO_URL,
        profileStatus: ProfileStatus.COMPLETE,
      });
      const currentKey = (await readStoredRow(hrAccountId)).photoKey;
      expect(currentKey).toMatch(PHOTO_KEY_PATTERN);
      expect(await readdir(photoDirectory)).toEqual([currentKey ?? '']);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return the profile without a photo URL when the own profile is read before any upload',
    async () => {
      const response = await request(app.getHttpServer())
        .get(OWN_PROFILE_PATH)
        .set('Authorization', `Bearer ${secondEmployeeToken}`)
        .expect(200);

      expect(response.body).toMatchObject({ photoUrl: null });
    },
    TEST_TIMEOUT_MS,
  );
});
