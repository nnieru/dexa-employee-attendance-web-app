import type { ReactTable, RowData } from '@tanstack/react-table';
import { Alert } from '../alert.js';
import { Button } from '../button.js';
import type { DataTableStatus } from './data-table.js';
import type { DataTableFeatures } from './data-table-features.js';

const DEFAULT_LOADING_MESSAGE = 'Loading records…';

type DataTableBodyProps<TRow extends RowData> = {
  emptyMessage: string;
  loadingMessage?: string;
  status: DataTableStatus;
  table: ReactTable<DataTableFeatures, TRow>;
};

/**
 * The narrow layout repeats each column name before its value, so the name must be plain text.
 * Columns whose header is a custom element get no label and show only their value.
 */
function getColumnLabel(header: unknown): string | undefined {
  return typeof header === 'string' ? header : undefined;
}

/**
 * Renders the single body state for the table: loading, error, empty, or the rows. Each state is
 * one row spanning every column, so the header stays in place and assistive technology reads one
 * outcome at a time.
 */
export function DataTableBody<TRow extends RowData>({
  emptyMessage,
  loadingMessage = DEFAULT_LOADING_MESSAGE,
  status,
  table,
}: DataTableBodyProps<TRow>) {
  const columnCount = table.getAllLeafColumns().length;

  if (status.kind === 'loading') {
    return (
      <tbody>
        <tr>
          <td className="dexa-data-table__state" colSpan={columnCount}>
            <p role="status" className="dexa-data-table__message">
              {loadingMessage}
            </p>
          </td>
        </tr>
      </tbody>
    );
  }

  if (status.kind === 'error') {
    const retryAction =
      status.onRetry === undefined ? undefined : (
        <Button variant="secondary" onClick={status.onRetry}>
          Try again
        </Button>
      );
    return (
      <tbody>
        <tr>
          <td className="dexa-data-table__state" colSpan={columnCount}>
            <Alert variant="error" action={retryAction}>
              {status.message}
            </Alert>
          </td>
        </tr>
      </tbody>
    );
  }

  const rows = table.getRowModel().rows;
  if (rows.length === 0) {
    return (
      <tbody>
        <tr>
          <td className="dexa-data-table__state" colSpan={columnCount}>
            <p className="dexa-data-table__message">{emptyMessage}</p>
          </td>
        </tr>
      </tbody>
    );
  }

  return (
    <tbody>
      {rows.map((row) => (
        <tr key={row.id}>
          {row.getAllCells().map((cell, cellIndex) => (
            <td
              key={cell.id}
              className={cellIndex === 0 ? 'dexa-data-table__lead' : undefined}
              data-label={getColumnLabel(cell.column.columnDef.header)}
            >
              <table.FlexRender cell={cell} />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}
