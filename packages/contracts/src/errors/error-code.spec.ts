import { ErrorCode } from './error-code.js';

describe('ErrorCode', () => {
  it.each(Object.entries(ErrorCode))(
    'should use its key as the value when code is %s',
    (key, value) => {
      expect(value).toBe(key);
    },
  );
});
