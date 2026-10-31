import { ServiceName, type IInternalHttpClient, type InternalGetRequest } from '@dexa/common';
import { MAX_PAGE_SIZE } from '@dexa/contracts';
import { dependencyOutage } from '../../test/scripted-clients.js';
import { AuthClient } from './auth.client.js';

// Three pages at the client's page size, so the paging loop runs more than once.
const RECIPIENT_COUNT = MAX_PAGE_SIZE * 2 + 50;
const RECIPIENT_IDS = Array.from(
  { length: RECIPIENT_COUNT },
  (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
);

type PageAnswer = {
  readonly items: ReadonlyArray<string>;
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
  readonly totalPages: number;
};

// Mirrors the page answer of auth-service: items for the requested page, and totals for the whole list.
function pageAnswer(page: number): PageAnswer {
  const start = (page - 1) * MAX_PAGE_SIZE;
  return {
    items: RECIPIENT_IDS.slice(start, start + MAX_PAGE_SIZE),
    page,
    pageSize: MAX_PAGE_SIZE,
    totalItems: RECIPIENT_COUNT,
    totalPages: Math.ceil(RECIPIENT_COUNT / MAX_PAGE_SIZE),
  };
}

// Records each GET and answers with the given value, or fails with the given error. The answer is parsed by the
// response schema the client passed, as the real client would parse it.
function recordingHttpClient(
  recorded: InternalGetRequest<unknown>[],
  respond: (request: InternalGetRequest<unknown>) => Promise<unknown>,
): IInternalHttpClient {
  return {
    get: async <TResponse>(request: InternalGetRequest<TResponse>): Promise<TResponse> => {
      recorded.push(request);
      return request.responseSchema.parse(await respond(request));
    },
    post: () => Promise.reject(new Error('The client never posts.')),
    getBinary: () => Promise.reject(new Error('The client never fetches bytes.')),
    patch: () => Promise.reject(new Error('The client never patches.')),
    putJson: () => Promise.reject(new Error('The client never puts JSON.')),
    put: () => Promise.reject(new Error('The client never puts.')),
    delete: () => Promise.reject(new Error('The client never deletes.')),
  };
}

function requestedPage(request: InternalGetRequest<unknown>): number {
  return Number(request.query?.page);
}

describe('AuthClient.listHrRecipientIds', () => {
  it('should read the HR recipient route with this service token and no user token', async () => {
    const recorded: InternalGetRequest<unknown>[] = [];
    const client = new AuthClient(
      recordingHttpClient(recorded, (request) =>
        Promise.resolve(pageAnswer(requestedPage(request))),
      ),
    );

    await client.listHrRecipientIds();

    expect(recorded[0]).toMatchObject({
      target: ServiceName.AUTH_SERVICE,
      path: '/api/v1/internal/accounts/hr-recipients',
      query: { page: '1', pageSize: String(MAX_PAGE_SIZE) },
    });
    expect(recorded[0]?.forwardedUserToken).toBeUndefined();
  });

  it('should read every page in order and return all recipient IDs', async () => {
    const recorded: InternalGetRequest<unknown>[] = [];
    const client = new AuthClient(
      recordingHttpClient(recorded, (request) =>
        Promise.resolve(pageAnswer(requestedPage(request))),
      ),
    );

    const recipientIds = await client.listHrRecipientIds();

    expect(recorded.map(requestedPage)).toEqual([1, 2, 3]);
    expect(recipientIds).toEqual(RECIPIENT_IDS);
  });

  it('should return an empty list after one call when no HR account is active', async () => {
    const recorded: InternalGetRequest<unknown>[] = [];
    const client = new AuthClient(
      recordingHttpClient(recorded, () =>
        Promise.resolve({
          items: [],
          page: 1,
          pageSize: MAX_PAGE_SIZE,
          totalItems: 0,
          totalPages: 0,
        }),
      ),
    );

    await expect(client.listHrRecipientIds()).resolves.toEqual([]);
    expect(recorded).toHaveLength(1);
  });

  it('should reject with the outage and return no partial list when a later page is unavailable', async () => {
    const outage = dependencyOutage();
    const client = new AuthClient(
      recordingHttpClient([], (request) => {
        if (requestedPage(request) === 1) {
          return Promise.resolve(pageAnswer(1));
        }
        return Promise.reject(outage);
      }),
    );

    await expect(client.listHrRecipientIds()).rejects.toBe(outage);
  });
});
