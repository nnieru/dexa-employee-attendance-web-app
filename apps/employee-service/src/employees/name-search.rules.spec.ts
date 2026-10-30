import { toNameContainsPattern } from './name-search.rules.js';

describe('toNameContainsPattern', () => {
  it.each([
    { term: 'nadia', pattern: '%nadia%' },
    { term: '100%', pattern: '%100\\%%' },
    { term: 'a_b', pattern: '%a\\_b%' },
    { term: 'a\\b', pattern: '%a\\\\b%' },
    { term: '%_\\', pattern: '%\\%\\_\\\\%' },
  ])('should escape the wildcards in the term $term', ({ term, pattern }) => {
    expect(toNameContainsPattern(term)).toBe(pattern);
  });
});
