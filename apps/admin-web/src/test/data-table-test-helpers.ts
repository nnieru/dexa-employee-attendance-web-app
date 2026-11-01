import { within } from '@testing-library/react';

/**
 * The cell under a column header, found by the header's text so the test does not depend on column order. Rows may open
 * with a second-column row header (for example the field name), counted as a cell for the index.
 */
export function getCellUnderHeader(row: HTMLElement, headerText: string): HTMLElement {
  const table = row.closest('table');
  if (table === null) throw new Error('The row is not inside a table.');
  const headerRow = table.querySelector('thead tr');
  if (!(headerRow instanceof HTMLElement)) throw new Error('The table has no header row.');
  const headerTexts = within(headerRow)
    .getAllByRole('columnheader')
    .map((header) => header.textContent);
  const columnIndex = headerTexts.indexOf(headerText);
  if (columnIndex === -1) throw new Error(`No column named "${headerText}".`);
  const cells = row.querySelectorAll<HTMLTableCellElement>(':scope > th, :scope > td');
  const cell = cells[columnIndex];
  if (cell === undefined) throw new Error(`The row has no cell for "${headerText}".`);
  return cell;
}
