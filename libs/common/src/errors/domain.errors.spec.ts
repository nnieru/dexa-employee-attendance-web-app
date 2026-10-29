import { ErrorCode } from '@dexa/contracts';
import {
  ConflictError,
  DependencyUnavailableError,
  DomainError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  type DomainErrorKind,
} from './domain.errors.js';

describe('DomainError subclasses', () => {
  const subclasses: ReadonlyArray<{
    errorClass: new (code: string, message: string) => DomainError;
    kind: DomainErrorKind;
    defaultCode: string;
  }> = [
    { errorClass: NotFoundError, kind: 'not_found', defaultCode: ErrorCode.NOT_FOUND },
    { errorClass: ConflictError, kind: 'conflict', defaultCode: ErrorCode.CONFLICT },
    { errorClass: ValidationError, kind: 'validation', defaultCode: ErrorCode.VALIDATION_FAILED },
    { errorClass: ForbiddenError, kind: 'forbidden', defaultCode: ErrorCode.FORBIDDEN },
    { errorClass: UnauthorizedError, kind: 'unauthorized', defaultCode: ErrorCode.UNAUTHORIZED },
    {
      errorClass: DependencyUnavailableError,
      kind: 'dependency_unavailable',
      defaultCode: ErrorCode.DEPENDENCY_UNAVAILABLE,
    },
  ];

  it.each(subclasses)(
    'should set kind $kind when constructed with code $defaultCode',
    ({ errorClass, kind, defaultCode }) => {
      const error = new errorClass(defaultCode, 'Something was refused.');

      expect(error).toBeInstanceOf(DomainError);
      expect(error).toBeInstanceOf(Error);
      expect(error.kind).toBe(kind);
      expect(error.code).toBe(defaultCode);
      expect(error.name).toBe(errorClass.name);
      expect(error.message).toBe('Something was refused.');
    },
  );

  it('should keep a feature-specific code when one is given', () => {
    const error = new ConflictError('ATTENDANCE_ALREADY_CLOCKED_IN', 'You are already clocked in.');

    expect(error.code).toBe('ATTENDANCE_ALREADY_CLOCKED_IN');
  });

  it('should keep the original error as cause when options include one', () => {
    const original = new Error('driver failure');

    const error = new NotFoundError(ErrorCode.NOT_FOUND, 'Employee not found.', {
      cause: original,
    });

    expect(error.cause).toBe(original);
  });
});
