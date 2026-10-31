import { createRef } from 'react';
import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IconButton } from './icon-button.js';

it('should name the button by its aria-label and render no visible text', () => {
  render(<IconButton aria-label="Previous page" iconName="chevron-left" />);

  const button = screen.getByRole('button', { name: 'Previous page' });
  expect(button.textContent).toBe('');
});

it('should default to a button type so it does not submit a surrounding form', () => {
  render(
    <form>
      <IconButton aria-label="Close" iconName="x" />
    </form>,
  );

  expect(screen.getByRole('button', { name: 'Close' })).toHaveAttribute('type', 'button');
});

it('should call onClick when pressed', async () => {
  const user = userEvent.setup();
  const onClick = vi.fn();
  render(<IconButton aria-label="Next page" iconName="chevron-right" onClick={onClick} />);

  await user.click(screen.getByRole('button', { name: 'Next page' }));

  expect(onClick).toHaveBeenCalledTimes(1);
});

it('should not call onClick when disabled', async () => {
  const user = userEvent.setup();
  const onClick = vi.fn();
  render(<IconButton aria-label="Next page" iconName="chevron-right" disabled onClick={onClick} />);

  await user.click(screen.getByRole('button', { name: 'Next page' }));

  expect(onClick).not.toHaveBeenCalled();
});

it('should forward the native ref to the button element', () => {
  const ref = createRef<HTMLButtonElement>();
  render(<IconButton ref={ref} aria-label="Close" iconName="x" />);

  expect(ref.current).toBe(screen.getByRole('button', { name: 'Close' }));
});
