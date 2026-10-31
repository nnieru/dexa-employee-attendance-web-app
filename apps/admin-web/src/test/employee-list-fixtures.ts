import type { EmployeeListItem, EmployeeListPage, PhotoThumbnailItem } from '@dexa/contracts';
import { HttpResponse, http } from 'msw';

export const EMPLOYEE_LIST_URL = '/api/v1/employees';
export const DEFAULT_TEST_PAGE_SIZE = 20;

const ACTIVE_STATUS = {
  id: '0c4e7b1a-3f5d-4a2b-9e6c-7d8f9a0b1c2d',
  code: 'ACTIVE',
  name: 'Active',
};
const POSITION = {
  id: '1d5f8c2b-4a6e-4b3c-8f7d-8e9a0b1c2d3e',
  code: 'ANALYST',
  name: 'Product Analyst',
};

/** One list row shaped like the contract. Ids are given by the test, so runs stay deterministic. */
export function buildEmployeeListItem(
  overrides: Pick<EmployeeListItem, 'accountId' | 'name'> & Partial<EmployeeListItem>,
): EmployeeListItem {
  return {
    email: `${overrides.name.toLowerCase().replace(/\s+/g, '.')}@dexa.test`,
    role: 'EMPLOYEE',
    position: POSITION,
    employeeStatus: ACTIVE_STATUS,
    phoneNumber: null,
    profileStatus: 'INCOMPLETE',
    photoUrl: null,
    ...overrides,
  };
}

export const RINA = buildEmployeeListItem({
  accountId: '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13',
  name: 'Rina Kusuma',
  profileStatus: 'COMPLETE',
  phoneNumber: '+628111111111',
});
export const BUDI = buildEmployeeListItem({
  accountId: '3a7d9c4e-1b2f-4c8a-8d5e-6f7a8b9c0d1e',
  name: 'Budi Santoso',
  role: 'HR',
  email: null,
  employeeStatus: {
    id: '2b8e0d5f-6c3a-4d1e-9f2b-3c4d5e6f7a8b',
    code: 'INACTIVE',
    name: 'Inactive',
  },
});
export const DEWI = buildEmployeeListItem({
  accountId: '7c2e5f8a-9d1b-4e6c-a3f4-0b5c6d7e8f9a',
  name: 'Dewi Lestari',
});

export function buildEmployeeListPage(options: {
  items?: ReadonlyArray<EmployeeListItem>;
  page?: number;
  totalItems: number;
  pageSize?: number;
}): EmployeeListPage {
  const pageSize = options.pageSize ?? DEFAULT_TEST_PAGE_SIZE;
  return {
    items: [...(options.items ?? [])],
    page: options.page ?? 1,
    pageSize,
    totalItems: options.totalItems,
    totalPages: Math.ceil(options.totalItems / pageSize),
  };
}

/** A list handler that answers every request with the same page. */
export function employeeListSucceeds(
  page: EmployeeListPage = buildEmployeeListPage({ totalItems: 0 }),
) {
  return http.get(EMPLOYEE_LIST_URL, () => HttpResponse.json(page));
}

export function employeeListFails() {
  return http.get(EMPLOYEE_LIST_URL, () =>
    HttpResponse.json(
      { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Something went wrong. Try again.' },
      { status: 500 },
    ),
  );
}

export const PHOTO_THUMBNAILS_URL = '/api/v1/employees/photo-thumbnails';

/** A valid 96 x 96 thumbnail data URL for tests. The bytes are only checked for base64 shape. */
export const TEST_THUMBNAIL = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

/** Answers every thumbnail request with `items`. With no items, every employee shows initials. */
export function photoThumbnailsSucceeds(items: ReadonlyArray<PhotoThumbnailItem> = []) {
  return http.post(PHOTO_THUMBNAILS_URL, () => HttpResponse.json({ items: [...items] }));
}

export function photoThumbnailsFail() {
  return http.post(PHOTO_THUMBNAILS_URL, () =>
    HttpResponse.json(
      { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Something went wrong. Try again.' },
      { status: 500 },
    ),
  );
}
