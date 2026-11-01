import { describe, expect, it } from 'vitest';
import { createCorrectionRequestSearchSchema } from './correction-request-search.schema.js';

const TODAY = '2026-11-02';
const SCHEMA = createCorrectionRequestSearchSchema(TODAY);

describe('createCorrectionRequestSearchSchema', () => {
  it.each([
    {
      search: { date: '2026-10-20' },
      expected: { date: '2026-10-20' },
      description: 'a date in the window',
    },
    { search: {}, expected: {}, description: 'no date' },
    { search: { date: '2026-09-01' }, expected: {}, description: 'a date outside the window' },
    { search: { date: '2026-11-03' }, expected: {}, description: 'a date after today' },
    { search: { date: '20-10-2026' }, expected: {}, description: 'a date in another format' },
    { search: { date: '2026-02-31' }, expected: {}, description: 'a date that does not exist' },
  ])(
    'should keep only a selectable date when the search has $description',
    ({ search, expected }) => {
      expect(SCHEMA.parse(search)).toEqual(expected);
    },
  );
});
