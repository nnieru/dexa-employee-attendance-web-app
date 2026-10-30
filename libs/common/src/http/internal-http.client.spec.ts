import { Buffer } from 'node:buffer';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { HttpService } from '@nestjs/axios';
import { ErrorCode } from '@dexa/contracts';
import axios from 'axios';
import { z } from 'zod';
import { ServiceName } from '../auth/service-name.js';
import type { IServiceTokenSigner } from '../auth/service-token-signer.interface.js';
import {
  DependencyUnavailableError,
  NotFoundError,
  PayloadTooLargeError,
  UnauthorizedError,
} from '../errors/domain.errors.js';
import { InternalHttpClient } from './internal-http.client.js';

const PHOTO_PATH = '/api/v1/employees/me/photo';
const SERVICE_TOKEN = 'service-token-for-employee-service';
const USER_TOKEN = 'user-access-token';
const PHOTO_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const ANSWER_SCHEMA = z.object({ accountId: z.string() });
const OVER_BOUND_BYTES = 6 * 1_048_576 + 1;

type RecordedRequest = {
  readonly method: string | undefined;
  readonly path: string | undefined;
  readonly contentType: string | undefined;
  readonly authorization: string | undefined;
  readonly body: Buffer;
};

// The script decides what each request to the fake employee-service receives. It records every request,
// so a test can count retries and inspect the bytes the client sent.
type Script = {
  respond: (request: RecordedRequest, attempt: number) => ScriptedAnswer;
};

type ScriptedAnswer = {
  readonly status: number;
  readonly contentType?: string;
  readonly body?: Buffer | string;
};

let server: Server;
let baseUrl: string;
let script: Script;
let recorded: RecordedRequest[];

beforeAll(async () => {
  server = createServer((request, response) => {
    void handleRequest(request, response);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error === undefined ? resolve() : reject(error))),
  );
});

beforeEach(() => {
  recorded = [];
  script = {
    respond: () => ({ status: 200, contentType: 'application/json', body: '{"accountId":"a"}' }),
  };
});

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of request)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const description: RecordedRequest = {
    method: request.method,
    path: request.url,
    contentType: request.headers['content-type'],
    authorization: request.headers.authorization,
    body: Buffer.concat(chunks),
  };
  recorded.push(description);
  const answer = script.respond(description, recorded.length);
  if (answer.contentType !== undefined) response.setHeader('Content-Type', answer.contentType);
  response.statusCode = answer.status;
  response.end(answer.body);
}

const tokenSigner: IServiceTokenSigner = { signFor: () => Promise.resolve(SERVICE_TOKEN) };

function createClient(): InternalHttpClient {
  const httpService = new HttpService(axios.create());
  return new InternalHttpClient(httpService, tokenSigner, {
    [ServiceName.EMPLOYEE_SERVICE]: baseUrl,
  });
}

function jsonError(status: number, code: string, message: string): ScriptedAnswer {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify({ statusCode: status, code, message }),
  };
}

describe('InternalHttpClient.put', () => {
  it('should send the file as a multipart part named by its field with the forwarded user token', async () => {
    const client = createClient();

    await client.put({
      target: ServiceName.EMPLOYEE_SERVICE,
      path: PHOTO_PATH,
      responseSchema: ANSWER_SCHEMA,
      file: { fieldName: 'photo', fileName: 'photo', content: PHOTO_BYTES },
      forwardedUserToken: USER_TOKEN,
    });

    expect(recorded).toHaveLength(1);
    const [request] = recorded;
    expect(request?.method).toBe('PUT');
    expect(request?.path).toBe(PHOTO_PATH);
    expect(request?.contentType).toMatch(/^multipart\/form-data; boundary=/);
    expect(request?.authorization).toBe(`Bearer ${USER_TOKEN}`);
    expect(request?.body.includes(Buffer.from('name="photo"'))).toBe(true);
    expect(request?.body.includes(PHOTO_BYTES)).toBe(true);
  });

  it('should resolve to the parsed answer when the target accepts the photo', async () => {
    const client = createClient();

    const answer = await client.put({
      target: ServiceName.EMPLOYEE_SERVICE,
      path: PHOTO_PATH,
      responseSchema: ANSWER_SCHEMA,
      file: { fieldName: 'photo', fileName: 'photo', content: PHOTO_BYTES },
      forwardedUserToken: USER_TOKEN,
    });

    expect(answer).toEqual({ accountId: 'a' });
  });

  it('should send the photo once and never retry when the answer is 503', async () => {
    script.respond = () => jsonError(503, 'UNAVAILABLE', 'Busy.');
    const client = createClient();

    await expect(
      client.put({
        target: ServiceName.EMPLOYEE_SERVICE,
        path: PHOTO_PATH,
        responseSchema: ANSWER_SCHEMA,
        file: { fieldName: 'photo', fileName: 'photo', content: PHOTO_BYTES },
        forwardedUserToken: USER_TOKEN,
      }),
    ).rejects.toBeInstanceOf(DependencyUnavailableError);

    expect(recorded).toHaveLength(1);
  });

  it('should map a 413 answer to PayloadTooLargeError with the target code', async () => {
    script.respond = () => jsonError(413, ErrorCode.PHOTO_TOO_LARGE, 'The photo is too large.');
    const client = createClient();

    const failure = await client
      .put({
        target: ServiceName.EMPLOYEE_SERVICE,
        path: PHOTO_PATH,
        responseSchema: ANSWER_SCHEMA,
        file: { fieldName: 'photo', fileName: 'photo', content: PHOTO_BYTES },
        forwardedUserToken: USER_TOKEN,
      })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(PayloadTooLargeError);
    expect(failure).toMatchObject({
      code: ErrorCode.PHOTO_TOO_LARGE,
      message: 'The photo is too large.',
    });
  });
});

describe('InternalHttpClient.getBinary', () => {
  it('should resolve to the bytes and the content type that the target answered with', async () => {
    script.respond = () => ({ status: 200, contentType: 'image/jpeg', body: PHOTO_BYTES });
    const client = createClient();

    const answer = await client.getBinary({
      target: ServiceName.EMPLOYEE_SERVICE,
      path: PHOTO_PATH,
      forwardedUserToken: USER_TOKEN,
    });

    expect(answer.contentType).toBe('image/jpeg');
    expect(answer.body.equals(PHOTO_BYTES)).toBe(true);
    expect(recorded[0]?.method).toBe('GET');
    expect(recorded[0]?.authorization).toBe(`Bearer ${USER_TOKEN}`);
  });

  it('should retry a 503 answer and resolve when a later attempt succeeds', async () => {
    script.respond = (_request, attempt) =>
      attempt === 1
        ? jsonError(503, 'UNAVAILABLE', 'Busy.')
        : { status: 200, contentType: 'image/jpeg', body: PHOTO_BYTES };
    const client = createClient();

    const answer = await client.getBinary({
      target: ServiceName.EMPLOYEE_SERVICE,
      path: PHOTO_PATH,
      forwardedUserToken: USER_TOKEN,
    });

    expect(answer.body.equals(PHOTO_BYTES)).toBe(true);
    expect(recorded).toHaveLength(2);
  });

  it('should map a 404 JSON answer to NotFoundError with the target code', async () => {
    script.respond = () => jsonError(404, ErrorCode.NOT_FOUND, 'Employee photo not found.');
    const client = createClient();

    const failure = await client
      .getBinary({
        target: ServiceName.EMPLOYEE_SERVICE,
        path: PHOTO_PATH,
        forwardedUserToken: USER_TOKEN,
      })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(NotFoundError);
    expect(failure).toMatchObject({ message: 'Employee photo not found.' });
  });

  it('should map a 401 refusal carrying a listed code to UnauthorizedError', async () => {
    script.respond = () =>
      jsonError(401, ErrorCode.ACCOUNT_DISABLED, 'This account is no longer active.');
    const client = createClient();

    const failure = await client
      .getBinary({
        target: ServiceName.EMPLOYEE_SERVICE,
        path: PHOTO_PATH,
        forwardedUserToken: USER_TOKEN,
        refusalCodes: [ErrorCode.ACCOUNT_DISABLED],
      })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(UnauthorizedError);
    expect(failure).toMatchObject({ code: ErrorCode.ACCOUNT_DISABLED });
  });

  it('should reject with DependencyUnavailableError when the answer has no content type', async () => {
    script.respond = () => ({ status: 200, body: PHOTO_BYTES });
    const client = createClient();

    await expect(
      client.getBinary({
        target: ServiceName.EMPLOYEE_SERVICE,
        path: PHOTO_PATH,
        forwardedUserToken: USER_TOKEN,
      }),
    ).rejects.toBeInstanceOf(DependencyUnavailableError);
  });

  it('should reject with DependencyUnavailableError and no bytes when the answer exceeds the bound', async () => {
    script.respond = () => ({
      status: 200,
      contentType: 'image/jpeg',
      body: Buffer.alloc(OVER_BOUND_BYTES),
    });
    const client = createClient();

    await expect(
      client.getBinary({
        target: ServiceName.EMPLOYEE_SERVICE,
        path: PHOTO_PATH,
        forwardedUserToken: USER_TOKEN,
      }),
    ).rejects.toBeInstanceOf(DependencyUnavailableError);
  });
});
