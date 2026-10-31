import { QueryClient } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listenForWindowFocus } from '@dexa/session';
import { mswServer } from '../../../test/msw-server.js';
import { accountCheckSucceeds, loginSucceeds } from '../../../test/admin-app-harness.js';
import {
  answerEmployeeList,
  getEmployeeRow,
  openEmployeeList,
  recordPhotoThumbnailRequests,
} from '../../../test/employee-list-test-helpers.js';
import {
  BUDI,
  DEWI,
  PHOTO_THUMBNAILS_URL,
  RINA,
  TEST_THUMBNAIL,
  buildEmployeeListPage,
  employeeListSucceeds,
  photoThumbnailsFail,
  photoThumbnailsSucceeds,
} from '../../../test/employee-list-fixtures.js';

let stopListeningForWindowFocus: () => void = () => undefined;

beforeEach(() => {
  mswServer.use(
    loginSucceeds(),
    accountCheckSucceeds(),
    employeeListSucceeds(),
    photoThumbnailsSucceeds(),
  );
  stopListeningForWindowFocus = listenForWindowFocus();
});

afterEach(() => {
  stopListeningForWindowFocus();
});

const THUMBNAIL_QUERY_KEY = ['employees', 'photo-thumbnails'];

describe('HR employee list photos', () => {
  it('should request the thumbnails of the page in one request with exactly the page IDs when the list has rows', async () => {
    answerEmployeeList(() => buildEmployeeListPage({ items: [RINA, BUDI, DEWI], totalItems: 3 }));
    const thumbnailRequests = recordPhotoThumbnailRequests();

    await openEmployeeList('/employees');
    await screen.findByRole('row', { name: /Dewi Lestari/ });

    await waitFor(() => expect(thumbnailRequests).toHaveLength(1));
    expect(thumbnailRequests[0]?.accountIds).toEqual(
      [RINA.accountId, BUDI.accountId, DEWI.accountId].sort(),
    );
  });

  it('should show the thumbnail as a photo labelled with the employee name when the row has one', async () => {
    answerEmployeeList(() => buildEmployeeListPage({ items: [RINA, BUDI], totalItems: 2 }));
    recordPhotoThumbnailRequests(() => [{ accountId: RINA.accountId, thumbnail: TEST_THUMBNAIL }]);

    await openEmployeeList('/employees');

    const photo = await screen.findByRole('img', { name: 'Photo of Rina Kusuma' });
    expect(photo).toHaveAttribute('src', TEST_THUMBNAIL);
    expect(within(getEmployeeRow('Rina Kusuma')).queryByText('RK')).not.toBeInTheDocument();
  });

  it('should show initials for a row without a thumbnail when the page mixes rows with and without one', async () => {
    answerEmployeeList(() => buildEmployeeListPage({ items: [RINA, BUDI], totalItems: 2 }));
    recordPhotoThumbnailRequests(() => [{ accountId: RINA.accountId, thumbnail: TEST_THUMBNAIL }]);

    await openEmployeeList('/employees');
    await screen.findByRole('img', { name: 'Photo of Rina Kusuma' });

    const budiRow = getEmployeeRow('Budi Santoso');
    expect(within(budiRow).getByRole('img', { name: 'Budi Santoso' })).toHaveTextContent('BS');
    expect(
      within(budiRow).queryByRole('img', { name: 'Photo of Budi Santoso' }),
    ).not.toBeInTheDocument();
  });

  it('should show the rows with initials while the thumbnails are pending, and then the photos when they arrive', async () => {
    let releaseThumbnails: () => void = () => undefined;
    const thumbnailsReleased = new Promise<void>((resolve) => {
      releaseThumbnails = resolve;
    });
    answerEmployeeList(() => buildEmployeeListPage({ items: [RINA], totalItems: 1 }));
    mswServer.use(
      http.post(PHOTO_THUMBNAILS_URL, async () => {
        await thumbnailsReleased;
        return HttpResponse.json({
          items: [{ accountId: RINA.accountId, thumbnail: TEST_THUMBNAIL }],
        });
      }),
    );

    await openEmployeeList('/employees');

    const rinaRow = await screen.findByRole('row', { name: /Rina Kusuma/ });
    expect(within(rinaRow).getByRole('img', { name: 'Rina Kusuma' })).toHaveTextContent('RK');
    expect(screen.getByRole('table', { name: 'Employees' })).toHaveAttribute('aria-busy', 'false');

    releaseThumbnails();

    expect(await screen.findByRole('img', { name: 'Photo of Rina Kusuma' })).toHaveAttribute(
      'src',
      TEST_THUMBNAIL,
    );
  });

  it('should keep the table and the initials, and show no alert, when the thumbnail request fails', async () => {
    const queryClient = new QueryClient();
    answerEmployeeList(() => buildEmployeeListPage({ items: [RINA, BUDI], totalItems: 2 }));
    mswServer.use(photoThumbnailsFail());

    await openEmployeeList('/employees', queryClient);
    // The cache also holds the disabled query for an empty page; the request that failed is the one with IDs.
    await waitFor(() =>
      expect(
        queryClient
          .getQueryCache()
          .findAll({ queryKey: THUMBNAIL_QUERY_KEY })
          .some((query) => query.state.status === 'error'),
      ).toBe(true),
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Employees' })).toHaveAttribute('aria-busy', 'false');
    expect(
      within(getEmployeeRow('Rina Kusuma')).getByRole('img', { name: 'Rina Kusuma' }),
    ).toHaveTextContent('RK');
    expect(
      within(getEmployeeRow('Budi Santoso')).getByRole('img', { name: 'Budi Santoso' }),
    ).toHaveTextContent('BS');
  });

  it('should send one thumbnail request for the new page IDs when the HR user changes the page', async () => {
    answerEmployeeList((query) =>
      query.get('page') === '2'
        ? buildEmployeeListPage({ items: [DEWI], page: 2, totalItems: 40 })
        : buildEmployeeListPage({ items: [RINA], totalItems: 40 }),
    );
    const thumbnailRequests = recordPhotoThumbnailRequests();
    const user = userEvent.setup();
    await openEmployeeList('/employees');
    await waitFor(() => expect(thumbnailRequests).toHaveLength(1));

    await user.click(screen.getByRole('button', { name: 'Next page' }));

    await screen.findByRole('row', { name: /Dewi Lestari/ });
    await waitFor(() => expect(thumbnailRequests).toHaveLength(2));
    expect(thumbnailRequests[1]?.accountIds).toEqual([DEWI.accountId]);
  });

  it('should send no thumbnail request when the page has no rows', async () => {
    answerEmployeeList(() => buildEmployeeListPage({ totalItems: 0 }));
    const thumbnailRequests = recordPhotoThumbnailRequests();

    await openEmployeeList('/employees');

    expect(await screen.findByText('No employees yet.')).toBeInTheDocument();
    expect(thumbnailRequests).toHaveLength(0);
  });
});
