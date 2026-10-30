import type { DomainErrorKind } from './domain.errors.js';
import { DOMAIN_ERROR_STATUS } from './domain-error-status.js';

describe('DOMAIN_ERROR_STATUS', () => {
  const expectedStatuses: ReadonlyArray<{ kind: DomainErrorKind; status: number }> = [
    { kind: 'not_found', status: 404 },
    { kind: 'conflict', status: 409 },
    { kind: 'validation', status: 400 },
    { kind: 'forbidden', status: 403 },
    { kind: 'unauthorized', status: 401 },
    { kind: 'dependency_unavailable', status: 503 },
    { kind: 'payload_too_large', status: 413 },
  ];

  it.each(expectedStatuses)('should map $kind to $status', ({ kind, status }) => {
    expect(DOMAIN_ERROR_STATUS[kind]).toBe(status);
  });
});
