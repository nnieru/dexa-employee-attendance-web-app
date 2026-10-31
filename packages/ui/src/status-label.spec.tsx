import { expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusLabel, type StatusLabelProps } from './status-label.js';

const TONE_CASES: ReadonlyArray<{ tone: NonNullable<StatusLabelProps['tone']>; text: string }> = [
  { tone: 'neutral', text: 'Not recorded yet' },
  { tone: 'success', text: 'On time' },
  { tone: 'warning', text: 'Late check-in' },
  { tone: 'error', text: 'Rejected' },
  { tone: 'info', text: 'Sick leave' },
];

it.each(TONE_CASES)('should render the visible text when the tone is $tone', ({ tone, text }) => {
  render(<StatusLabel tone={tone}>{text}</StatusLabel>);

  expect(screen.getByText(text)).toBeInTheDocument();
});

it.each(TONE_CASES)(
  'should apply the $tone tone class when the tone is $tone',
  ({ tone, text }) => {
    render(<StatusLabel tone={tone}>{text}</StatusLabel>);

    expect(screen.getByText(text)).toHaveClass('dexa-status-label', `dexa-status-label--${tone}`);
  },
);

it('should apply the neutral tone class when no tone is given', () => {
  render(<StatusLabel>Active</StatusLabel>);

  expect(screen.getByText('Active')).toHaveClass('dexa-status-label--neutral');
});

it('should expose no role and no live region when rendered as static status text', () => {
  const { container } = render(<StatusLabel tone="warning">Late check-in</StatusLabel>);

  const label = screen.getByText('Late check-in');
  expect(label).not.toHaveAttribute('role');
  expect(label).not.toHaveAttribute('aria-live');
  expect(container.querySelector('[role], [aria-live]')).toBeNull();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('should render no interactive control when rendered as a label', () => {
  render(<StatusLabel tone="success">On time</StatusLabel>);

  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});
