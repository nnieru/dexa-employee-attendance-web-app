import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listenForWindowFocus } from '@dexa/session';
import { mswServer } from '../../../test/msw-server.js';
import { accountCheckSucceeds, loginSucceeds } from '../../../test/admin-app-harness.js';
import {
  answerEmployeeList,
  getEmployeeRow,
  getSearchBox,
  openEmployeeList,
} from '../../../test/employee-list-test-helpers.js';
import {
  BUDI,
  DEWI,
  EMPLOYEE_LIST_URL,
  RINA,
  buildEmployeeListPage,
  employeeListFails,
  employeeListSucceeds,
  photoThumbnailsSucceeds,
} from '../../../test/employee-list-fixtures.js';

const NO_EMPLOYEES_MESSAGE = 'No employees yet.';
const NO_SEARCH_MATCHES_MESSAGE = 'No employees match this search. Try another name or email.';
const NO_EMPLOYEES_ON_PAGE_MESSAGE = 'No employees on this page. Go back to an earlier page.';
const LIST_ERROR_MESSAGE = 'The employee list could not be loaded. Try again.';

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

describe('HR employee list', () => {
  it('should show each employee with initials, email, role, position, and labelled statuses when the list has employees', async () => {
    mswServer.use(
      employeeListSucceeds(buildEmployeeListPage({ items: [RINA, BUDI], totalItems: 2 })),
    );
    await openEmployeeList('/employees');

    const rinaRow = await screen.findByRole('row', { name: /Rina Kusuma/ });
    expect(within(rinaRow).getByRole('img', { name: 'Rina Kusuma' })).toHaveTextContent('RK');
    expect(within(rinaRow).getByText('rina.kusuma@dexa.test')).toBeInTheDocument();
    expect(within(rinaRow).getByText('Employee')).toBeInTheDocument();
    expect(within(rinaRow).getByText('Product Analyst')).toBeInTheDocument();
    expect(within(rinaRow).getByText('Active')).toHaveClass('dexa-status-label--success');
    expect(within(rinaRow).getByText('Complete')).toHaveClass('dexa-status-label--success');

    const budiRow = getEmployeeRow('Budi Santoso');
    expect(within(budiRow).getByText('Not available')).toBeInTheDocument();
    expect(within(budiRow).getByText('HR')).toBeInTheDocument();
    expect(within(budiRow).getByText('Inactive')).toHaveClass('dexa-status-label--neutral');
    expect(within(budiRow).getByText('Incomplete')).toHaveClass('dexa-status-label--warning');
    expect(screen.queryByRole('link', { name: /Edit / })).not.toBeInTheDocument();
  });

  it('should send the search term, reset the page to 1, and write both to the URL when the HR user searches from page 3', async () => {
    const requestQueries = answerEmployeeList((query) =>
      buildEmployeeListPage({
        items: query.get('q') === 'rina' ? [RINA] : [DEWI],
        page: Number(query.get('page')),
        totalItems: 60,
      }),
    );
    const { user, router } = await openEmployeeList('/employees?page=3');
    await screen.findByRole('row', { name: /Dewi Lestari/ });

    await user.type(getSearchBox(), '  rina  ');
    await user.click(screen.getByRole('button', { name: 'Search' }));

    expect(await screen.findByRole('row', { name: /Rina Kusuma/ })).toBeInTheDocument();
    expect(requestQueries.at(-1)?.get('q')).toBe('rina');
    expect(requestQueries.at(-1)?.get('page')).toBe('1');
    expect(router.state.location.search).toMatchObject({ q: 'rina', page: 1 });
  });

  it('should run the search on Enter and not on each keystroke when the HR user types a term', async () => {
    const requestQueries = answerEmployeeList(() =>
      buildEmployeeListPage({ items: [RINA], totalItems: 1 }),
    );
    const { user, router } = await openEmployeeList('/employees');
    await screen.findByRole('row', { name: /Rina Kusuma/ });
    const initialRequestCount = requestQueries.length;

    await user.type(getSearchBox(), 'rin');
    expect(requestQueries).toHaveLength(initialRequestCount);

    await user.type(getSearchBox(), 'a{Enter}');

    expect(await screen.findByRole('row', { name: /Rina Kusuma/ })).toBeInTheDocument();
    expect(requestQueries.length).toBeGreaterThan(initialRequestCount);
    expect(requestQueries.at(-1)?.get('q')).toBe('rina');
    expect(router.state.location.search).toMatchObject({ q: 'rina' });
  });

  it('should omit q from the request when the HR user submits a blank search', async () => {
    const requestQueries = answerEmployeeList(() =>
      buildEmployeeListPage({ items: [RINA], totalItems: 1 }),
    );
    const { user, router } = await openEmployeeList('/employees?q=rina');
    await screen.findByRole('row', { name: /Rina Kusuma/ });

    await user.clear(getSearchBox());
    await user.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => expect(requestQueries.at(-1)?.has('q')).toBe(false));
    expect(requestQueries.at(-1)?.get('page')).toBe('1');
    expect(router.state.location.search).not.toHaveProperty('q');
  });

  it('should show a too-long search as a field error and send no request when the term is over 254 characters', async () => {
    const requestQueries = answerEmployeeList(() => buildEmployeeListPage({ totalItems: 0 }));
    const { user } = await openEmployeeList('/employees');
    await screen.findByText(NO_EMPLOYEES_MESSAGE);
    const requestCountBeforeSearch = requestQueries.length;

    await user.type(getSearchBox(), 'a'.repeat(255));
    await user.click(screen.getByRole('button', { name: 'Search' }));

    expect(await screen.findByText('Use 254 characters or fewer.')).toBeInTheDocument();
    expect(getSearchBox()).toHaveAttribute('aria-invalid', 'true');
    expect(requestQueries).toHaveLength(requestCountBeforeSearch);
  });

  it('should request the next page and write the page to the URL when the HR user selects Next page', async () => {
    const requestQueries = answerEmployeeList((query) =>
      buildEmployeeListPage({
        items: [Number(query.get('page')) === 1 ? RINA : DEWI],
        page: Number(query.get('page')),
        totalItems: 40,
      }),
    );
    const { user, router } = await openEmployeeList('/employees?q=rina');
    await screen.findByRole('row', { name: /Rina Kusuma/ });

    await user.click(screen.getByRole('button', { name: 'Next page' }));

    expect(await screen.findByRole('row', { name: /Dewi Lestari/ })).toBeInTheDocument();
    expect(requestQueries.at(-1)?.get('page')).toBe('2');
    expect(requestQueries.at(-1)?.get('q')).toBe('rina');
    expect(router.state.location.search).toMatchObject({ q: 'rina', page: 2 });
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
  });

  it('should keep the previous rows, mark the table busy, and show the updating message while the next page loads', async () => {
    let releaseNextPage: () => void = () => undefined;
    const nextPageReleased = new Promise<void>((resolve) => {
      releaseNextPage = resolve;
    });
    mswServer.use(
      http.get(EMPLOYEE_LIST_URL, async ({ request }) => {
        const isNextPage = new URL(request.url).searchParams.get('page') === '2';
        if (isNextPage) await nextPageReleased;
        return HttpResponse.json(
          buildEmployeeListPage({
            items: [isNextPage ? DEWI : RINA],
            page: isNextPage ? 2 : 1,
            totalItems: 40,
          }),
        );
      }),
    );
    const { user } = await openEmployeeList('/employees');
    await screen.findByRole('row', { name: /Rina Kusuma/ });

    await user.click(screen.getByRole('button', { name: 'Next page' }));

    expect(await screen.findByText('Updating records…')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Employees' })).toHaveAttribute('aria-busy', 'true');
    expect(getEmployeeRow('Rina Kusuma')).toBeInTheDocument();

    releaseNextPage();

    expect(await screen.findByRole('row', { name: /Dewi Lestari/ })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Employees' })).toHaveAttribute('aria-busy', 'false');
  });

  it('should show the loading message until the first list answers when the page opens', async () => {
    let releaseFirstAnswer: () => void = () => undefined;
    const firstAnswerReleased = new Promise<void>((resolve) => {
      releaseFirstAnswer = resolve;
    });
    mswServer.use(
      http.get(EMPLOYEE_LIST_URL, async () => {
        await firstAnswerReleased;
        return HttpResponse.json(buildEmployeeListPage({ items: [RINA], totalItems: 1 }));
      }),
    );
    await openEmployeeList('/employees');

    expect(screen.getByText('Loading records…')).toHaveAttribute('role', 'status');
    expect(screen.getByRole('table', { name: 'Employees' })).toHaveAttribute('aria-busy', 'true');

    releaseFirstAnswer();

    expect(await screen.findByRole('row', { name: /Rina Kusuma/ })).toBeInTheDocument();
  });

  it('should send the q and page from the URL in the first request and show the term in the search box when the page opens with them', async () => {
    const requestQueries = answerEmployeeList(() =>
      buildEmployeeListPage({ items: [DEWI], page: 2, totalItems: 30 }),
    );

    await openEmployeeList('/employees?q=dewi&page=2');
    await screen.findByRole('row', { name: /Dewi Lestari/ });

    expect(requestQueries[0]?.get('q')).toBe('dewi');
    expect(requestQueries[0]?.get('page')).toBe('2');
    expect(requestQueries[0]?.get('pageSize')).toBe('20');
    expect(getSearchBox()).toHaveValue('dewi');
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
  });

  it('should show the no-employees message when no employee exists and no search is active', async () => {
    await openEmployeeList('/employees');

    expect(await screen.findByText(NO_EMPLOYEES_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText(NO_SEARCH_MATCHES_MESSAGE)).not.toBeInTheDocument();
  });

  it('should show the no-match message when the search finds no employee', async () => {
    answerEmployeeList(() => buildEmployeeListPage({ totalItems: 0 }));
    const { user } = await openEmployeeList('/employees');
    await screen.findByText(NO_EMPLOYEES_MESSAGE);

    await user.type(getSearchBox(), 'zzz{Enter}');

    expect(await screen.findByText(NO_SEARCH_MATCHES_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText(NO_EMPLOYEES_MESSAGE)).not.toBeInTheDocument();
  });

  it('should show the no-employees-on-page message when the URL page is past the last page', async () => {
    answerEmployeeList((query) =>
      buildEmployeeListPage({ items: [], page: Number(query.get('page')), totalItems: 3 }),
    );
    await openEmployeeList('/employees?page=5');

    expect(await screen.findByText(NO_EMPLOYEES_ON_PAGE_MESSAGE)).toBeInTheDocument();
  });

  it('should show the error with a Try again action when the list request fails', async () => {
    mswServer.use(employeeListFails());
    const { router } = await openEmployeeList('/employees');

    expect(await screen.findByRole('alert')).toHaveTextContent(LIST_ERROR_MESSAGE);
    expect(router.state.location.pathname).toBe('/employees');
  });

  it('should load the list again when the HR user selects Try again after a failed request', async () => {
    let requestCount = 0;
    mswServer.use(
      http.get(EMPLOYEE_LIST_URL, () => {
        requestCount += 1;
        if (requestCount === 1) {
          return HttpResponse.json(
            {
              statusCode: 500,
              code: 'INTERNAL_ERROR',
              message: 'Something went wrong. Try again.',
            },
            { status: 500 },
          );
        }
        return HttpResponse.json(buildEmployeeListPage({ items: [RINA], totalItems: 1 }));
      }),
    );
    const { user } = await openEmployeeList('/employees');
    await screen.findByRole('alert');

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('row', { name: /Rina Kusuma/ })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(requestCount).toBe(2);
  });
});
