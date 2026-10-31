import { describe, expect, it, vi } from 'vitest';
import {
  EMPLOYEE_LIST_ERROR_MESSAGE,
  NO_EMPLOYEES_MESSAGE,
  NO_EMPLOYEES_ON_PAGE_MESSAGE,
  NO_SEARCH_MATCHES_MESSAGE,
  getEmployeeEmptyMessage,
  getEmployeeTableStatus,
} from './employee-list-messages.js';

describe('getEmployeeEmptyMessage', () => {
  it.each([
    ['no employee exists and no search is active', '', 0, NO_EMPLOYEES_MESSAGE],
    ['a search matches no employee', 'zzz', 0, NO_SEARCH_MATCHES_MESSAGE],
    ['the page is past the last page', '', 3, NO_EMPLOYEES_ON_PAGE_MESSAGE],
  ])('should explain the empty list when %s', (_label, searchTerm, totalItems, message) => {
    expect(getEmployeeEmptyMessage({ searchTerm, totalItems })).toBe(message);
  });
});

describe('getEmployeeTableStatus', () => {
  const onRetry = vi.fn();

  it('should show the error with the retry action when the request failed, even if rows are on screen', () => {
    expect(
      getEmployeeTableStatus({ hasError: true, isFetching: false, isPending: false, onRetry }),
    ).toEqual({ kind: 'error', message: EMPLOYEE_LIST_ERROR_MESSAGE, onRetry });
  });

  it('should show the loading state when the first request is pending', () => {
    expect(
      getEmployeeTableStatus({ hasError: false, isFetching: true, isPending: true, onRetry }),
    ).toEqual({ kind: 'loading' });
  });

  it('should show the refreshing state when a request runs while rows are shown', () => {
    expect(
      getEmployeeTableStatus({ hasError: false, isFetching: true, isPending: false, onRetry }),
    ).toEqual({ kind: 'refreshing' });
  });

  it('should show the ready state when nothing is pending or fetching', () => {
    expect(
      getEmployeeTableStatus({ hasError: false, isFetching: false, isPending: false, onRetry }),
    ).toEqual({ kind: 'ready' });
  });
});
