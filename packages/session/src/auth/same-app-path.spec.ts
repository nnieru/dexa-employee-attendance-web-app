import { describe, expect, it } from 'vitest';
import { isSameAppPath } from './same-app-path.js';

describe('isSameAppPath', () => {
  it.each(['/attendance', '/profile?tab=phone', '/history#week', '/requests/42'])(
    'should accept %s when it is a path on this app',
    (candidate) => {
      expect(isSameAppPath(candidate)).toBe(true);
    },
  );

  it.each([
    'https://evil.example/steal',
    'http://evil.example',
    '//evil.example/steal',
    '/\\evil.example',
    '/\t/evil.example',
    'evil.example/steal',
    '',
  ])('should reject %j when it would leave this app', (candidate) => {
    expect(isSameAppPath(candidate)).toBe(false);
  });
});
