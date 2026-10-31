import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DateRangeFilter, type DateRangeFilterProps } from './date-range-filter.js';

const TODAY = '2026-10-31';
const APPLIED_RANGE = { from: '2026-10-01', to: '2026-10-31' };

function renderFilter(overrides: Partial<DateRangeFilterProps> = {}) {
  const props: DateRangeFilterProps = {
    value: APPLIED_RANGE,
    today: TODAY,
    onSearch: vi.fn(),
    onReset: vi.fn(),
    ...overrides,
  };
  const view = render(<DateRangeFilter {...props} />);

  return { ...view, props };
}

function getFromInput(): HTMLInputElement {
  return screen.getByLabelText('From') as HTMLInputElement;
}

function getToInput(): HTMLInputElement {
  return screen.getByLabelText('To') as HTMLInputElement;
}

it('should submit the edited From and To values when Search is pressed', async () => {
  const user = userEvent.setup();
  const { props } = renderFilter();
  fireEvent.change(getFromInput(), { target: { value: '2026-10-05' } });
  fireEvent.change(getToInput(), { target: { value: '2026-10-20' } });

  await user.click(screen.getByRole('button', { name: 'Search' }));

  expect(props.onSearch).toHaveBeenCalledTimes(1);
  expect(props.onSearch).toHaveBeenCalledWith({ from: '2026-10-05', to: '2026-10-20' });
});

it('should submit the applied values when Enter is pressed in a date field without edits', async () => {
  const user = userEvent.setup();
  const { props } = renderFilter();

  getToInput().focus();
  await user.keyboard('{Enter}');

  expect(props.onSearch).toHaveBeenCalledWith(APPLIED_RANGE);
});

it('should call onReset when Reset is pressed', async () => {
  const user = userEvent.setup();
  const { props } = renderFilter();

  await user.click(screen.getByRole('button', { name: 'Reset' }));

  expect(props.onReset).toHaveBeenCalledTimes(1);
  expect(props.onSearch).not.toHaveBeenCalled();
});

it('should discard unsubmitted edits when Reset is pressed', async () => {
  const user = userEvent.setup();
  renderFilter();
  fireEvent.change(getFromInput(), { target: { value: '2026-10-15' } });

  await user.click(screen.getByRole('button', { name: 'Reset' }));

  expect(getFromInput()).toHaveValue(APPLIED_RANGE.from);
});

it('should show the error next to To and link it to the input when an error is given', () => {
  renderFilter({ error: 'From must be on or before To.' });

  const toInput = getToInput();
  expect(toInput).toHaveAttribute('aria-invalid', 'true');
  expect(toInput).toHaveAccessibleDescription('From must be on or before To.');
  expect(screen.getByText('From must be on or before To.').closest('.dexa-field')).toBe(
    toInput.closest('.dexa-field'),
  );
});

it('should not mark From invalid when an error is given', () => {
  renderFilter({ error: 'From must be on or before To.' });

  expect(getFromInput()).not.toHaveAttribute('aria-invalid');
});

it('should not show an error when none is given', () => {
  renderFilter();

  expect(getToInput()).not.toHaveAttribute('aria-invalid');
  expect(getToInput()).not.toHaveAccessibleDescription();
});

it.each([
  { preset: '1 week', from: '2026-10-25', to: '2026-10-31' },
  { preset: '1 month', from: '2026-10-01', to: '2026-10-31' },
  { preset: '3 months', from: '2026-08-01', to: '2026-10-31' },
])(
  'should fill From with $from and To with $to without submitting when $preset is pressed',
  async ({ preset, from, to }) => {
    const user = userEvent.setup();
    const { props } = renderFilter({ value: { from: '2026-01-01', to: '2026-01-02' } });
    const quickRanges = screen.getByRole('group', { name: 'Quick range' });

    await user.click(within(quickRanges).getByRole('button', { name: preset }));

    expect(getFromInput()).toHaveValue(from);
    expect(getToInput()).toHaveValue(to);
    expect(props.onSearch).not.toHaveBeenCalled();
  },
);

it('should show the new range when the applied value changes', () => {
  const { rerender, props } = renderFilter();

  rerender(<DateRangeFilter {...props} value={{ from: '2026-09-01', to: '2026-09-30' }} />);

  expect(getFromInput()).toHaveValue('2026-09-01');
  expect(getToInput()).toHaveValue('2026-09-30');
});

it('should keep unsubmitted edits when the parent renders the same applied range again', () => {
  const { rerender, props } = renderFilter();
  fireEvent.change(getFromInput(), { target: { value: '2026-10-15' } });

  rerender(<DateRangeFilter {...props} value={{ ...APPLIED_RANGE }} />);

  expect(getFromInput()).toHaveValue('2026-10-15');
});
