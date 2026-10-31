import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pagination } from './pagination.js';

it('should show the current page and the total pages when rendered', () => {
  render(<Pagination page={2} pageCount={5} onPageChange={vi.fn()} />);

  expect(screen.getByText('Page 2 of 5')).toBeInTheDocument();
});

it('should disable previous and enable next when on the first page', () => {
  render(<Pagination page={1} pageCount={5} onPageChange={vi.fn()} />);

  expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled();
});

it('should disable next and enable previous when on the last page', () => {
  render(<Pagination page={5} pageCount={5} onPageChange={vi.fn()} />);

  expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Previous page' })).toBeEnabled();
});

it('should disable both controls when there is a single page', () => {
  render(<Pagination page={1} pageCount={1} onPageChange={vi.fn()} />);

  expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
});

it('should show a single page when the page count is zero', () => {
  render(<Pagination page={1} pageCount={0} onPageChange={vi.fn()} />);

  expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
});

it('should call onPageChange with the next page when next is clicked', async () => {
  const user = userEvent.setup();
  const onPageChange = vi.fn();
  render(<Pagination page={2} pageCount={5} onPageChange={onPageChange} />);

  await user.click(screen.getByRole('button', { name: 'Next page' }));

  expect(onPageChange).toHaveBeenCalledTimes(1);
  expect(onPageChange).toHaveBeenCalledWith(3);
});

it('should call onPageChange with the previous page when previous is clicked', async () => {
  const user = userEvent.setup();
  const onPageChange = vi.fn();
  render(<Pagination page={4} pageCount={5} onPageChange={onPageChange} />);

  await user.click(screen.getByRole('button', { name: 'Previous page' }));

  expect(onPageChange).toHaveBeenCalledTimes(1);
  expect(onPageChange).toHaveBeenCalledWith(3);
});

it('should disable both controls and not call onPageChange when isDisabled is true', async () => {
  const user = userEvent.setup();
  const onPageChange = vi.fn();
  render(<Pagination page={3} pageCount={5} isDisabled onPageChange={onPageChange} />);

  expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Next page' }));
  expect(onPageChange).not.toHaveBeenCalled();
});

it('should name the navigation landmark Pagination by default', () => {
  render(<Pagination page={1} pageCount={2} onPageChange={vi.fn()} />);

  expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument();
});

it('should show the summary on the left of the controls when a summary is given', () => {
  render(<Pagination page={1} pageCount={3} summary="41 records" onPageChange={vi.fn()} />);

  const summary = screen.getByText('41 records');
  const previousButton = screen.getByRole('button', { name: 'Previous page' });
  expect(
    summary.compareDocumentPosition(previousButton) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});

it('should show the page text between the previous and next buttons when rendered', () => {
  render(<Pagination page={2} pageCount={5} onPageChange={vi.fn()} />);

  const previousButton = screen.getByRole('button', { name: 'Previous page' });
  const pageText = screen.getByText('Page 2 of 5');
  const nextButton = screen.getByRole('button', { name: 'Next page' });
  expect(
    previousButton.compareDocumentPosition(pageText) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    pageText.compareDocumentPosition(nextButton) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});

it('should render no summary text when the summary is omitted', () => {
  const { container } = render(<Pagination page={1} pageCount={2} onPageChange={vi.fn()} />);

  expect(container.querySelector('.dexa-pagination__summary')).toBeNull();
});
