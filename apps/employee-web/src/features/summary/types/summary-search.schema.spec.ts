import { describe, expect, it } from 'vitest';
import { createSummarySearchSchema } from './summary-search.schema.js';

const TODAY = '2026-11-15';
const schema = createSummarySearchSchema(TODAY);

describe('summary search schema defaults', () => {
  it('should default from to the first of the WIB month and to to today when the URL has no range', () => {
    expect(schema.parse({})).toEqual({ from: '2026-11-01', to: '2026-11-15', page: 1 });
  });

  it('should keep a valid range and page from the URL', () => {
    expect(schema.parse({ from: '2026-10-03', to: '2026-10-20', page: '4' })).toEqual({
      from: '2026-10-03',
      to: '2026-10-20',
      page: 4,
    });
  });

  it('should default a single missing bound without changing the other', () => {
    expect(schema.parse({ from: '2026-09-01' })).toEqual({
      from: '2026-09-01',
      to: TODAY,
      page: 1,
    });
    expect(schema.parse({ to: '2026-10-31' })).toEqual({
      from: '2026-11-01',
      to: '2026-10-31',
      page: 1,
    });
  });

  it('should replace unusable values with their defaults', () => {
    expect(schema.parse({ from: '2026-02-30', to: 'soon', page: '0' })).toEqual({
      from: '2026-11-01',
      to: TODAY,
      page: 1,
    });
    expect(schema.parse({ page: 'two' })).toEqual({ from: '2026-11-01', to: TODAY, page: 1 });
  });

  it('should keep an out-of-order range so the page can explain it', () => {
    expect(schema.parse({ from: '2026-11-10', to: '2026-11-01' })).toEqual({
      from: '2026-11-10',
      to: '2026-11-01',
      page: 1,
    });
  });

  it('should take the first of the month from the given today when today is the first day', () => {
    expect(createSummarySearchSchema('2026-12-01').parse({})).toEqual({
      from: '2026-12-01',
      to: '2026-12-01',
      page: 1,
    });
  });
});
