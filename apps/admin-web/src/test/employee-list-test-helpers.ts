import type { QueryClient } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import {
  photoThumbnailRequestSchema,
  type EmployeeListPage,
  type PhotoThumbnailItem,
  type PhotoThumbnailRequest,
} from '@dexa/contracts';
import { mswServer } from './msw-server.js';
import { HR_ACCOUNT, renderAdminApp, signInWith } from './admin-app-harness.js';
import { EMPLOYEE_LIST_URL, PHOTO_THUMBNAILS_URL } from './employee-list-fixtures.js';

/** Records the query of every list request, and answers each with the page `respond` returns. */
export function answerEmployeeList(
  respond: (query: URLSearchParams) => EmployeeListPage,
): Array<URLSearchParams> {
  const requestQueries: Array<URLSearchParams> = [];
  mswServer.use(
    http.get(EMPLOYEE_LIST_URL, ({ request }) => {
      const query = new URL(request.url).searchParams;
      requestQueries.push(query);
      return HttpResponse.json(respond(query));
    }),
  );
  return requestQueries;
}

/** Records the body of every thumbnail request, and answers each with the items `respond` returns. */
export function recordPhotoThumbnailRequests(
  respond: (request: PhotoThumbnailRequest) => ReadonlyArray<PhotoThumbnailItem> = () => [],
): Array<PhotoThumbnailRequest> {
  const requests: Array<PhotoThumbnailRequest> = [];
  mswServer.use(
    http.post(PHOTO_THUMBNAILS_URL, async ({ request }) => {
      const body = photoThumbnailRequestSchema.parse(await request.json());
      requests.push(body);
      return HttpResponse.json({ items: [...respond(body)] });
    }),
  );
  return requests;
}

/** Signs in and lands on `path`, so the first list request is driven by the URL the page opened with. */
export async function openEmployeeList(path: string, queryClient?: QueryClient) {
  const user = userEvent.setup();
  const router = await renderAdminApp(`/login?redirect=${encodeURIComponent(path)}`, queryClient);
  await signInWith(user, HR_ACCOUNT.email);
  await screen.findByRole('heading', { level: 1, name: 'Employees' });
  return { user, router };
}

export function getEmployeeRow(name: string): HTMLElement {
  return screen.getByRole('row', { name: new RegExp(name) });
}

export function getSearchBox(): HTMLElement {
  return screen.getByRole('searchbox', { name: 'Search by name or email' });
}
