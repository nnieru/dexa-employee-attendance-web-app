import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Alert } from './alert.js';

it('should announce the message with role alert when the variant is error', () => {
  render(<Alert variant="error">Attendance was not recorded.</Alert>);

  expect(screen.getByRole('alert')).toHaveTextContent('Attendance was not recorded.');
});

it.each(['neutral', 'success', 'warning'] as const)(
  'should announce the message with role status when the variant is %s',
  (variant) => {
    render(<Alert variant={variant}>Changes saved.</Alert>);

    expect(screen.getByRole('status')).toHaveTextContent('Changes saved.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  },
);

it('should default to the neutral status announcement when no variant is given', () => {
  render(<Alert>Guidance text.</Alert>);

  expect(screen.getByRole('status')).toHaveTextContent('Guidance text.');
});

it('should render the action inside the alert and call it when the action is clicked', async () => {
  const user = userEvent.setup();
  const onRetry = vi.fn();
  render(
    <Alert
      variant="error"
      action={
        <button type="button" onClick={onRetry}>
          Try again
        </button>
      }
    >
      Attendance was not recorded.
    </Alert>,
  );

  const alert = screen.getByRole('alert');
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  expect(onRetry).toHaveBeenCalledTimes(1);
  expect(alert).toContainElement(screen.getByRole('button', { name: 'Try again' }));
});

it('should render no action control when the action is omitted', () => {
  render(<Alert variant="success">Changes saved.</Alert>);

  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

it('should show a close icon button with the name Dismiss message when onDismiss is given', async () => {
  const user = userEvent.setup();
  const onDismiss = vi.fn();
  render(
    <Alert variant="success" onDismiss={onDismiss}>
      Changes saved.
    </Alert>,
  );

  await user.click(screen.getByRole('button', { name: 'Dismiss message' }));

  expect(onDismiss).toHaveBeenCalledTimes(1);
});

it('should render no close button when onDismiss is omitted', () => {
  render(<Alert variant="success">Changes saved.</Alert>);

  expect(screen.queryByRole('button', { name: 'Dismiss message' })).not.toBeInTheDocument();
});
