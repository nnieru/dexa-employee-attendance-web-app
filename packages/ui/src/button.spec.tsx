import { createRef, type FormEvent } from 'react';
import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './button.js';

it('supports keyboard activation and prevents disabled interaction', async () => {
  const user = userEvent.setup();
  const onClick = vi.fn();
  const view = render(<Button onClick={onClick}>Continue</Button>);
  await user.tab();
  expect(screen.getByRole('button')).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(onClick).toHaveBeenCalledTimes(1);
  view.rerender(
    <Button disabled onClick={onClick}>
      Continue
    </Button>,
  );
  await user.click(screen.getByRole('button'));
  expect(onClick).toHaveBeenCalledTimes(1);
});

it('keeps the label while loading and prevents duplicate activation', async () => {
  const user = userEvent.setup();
  const onClick = vi.fn();
  render(
    <Button isLoading onClick={onClick}>
      Continue
    </Button>,
  );

  const button = screen.getByRole('button', { name: 'Continue' });
  expect(button).toBeDisabled();
  expect(button).toHaveAttribute('aria-busy', 'true');
  await user.click(button);
  expect(onClick).not.toHaveBeenCalled();
});

it('forwards the native ref and uses a safe default button type', () => {
  const ref = createRef<HTMLButtonElement>();
  render(
    <Button ref={ref} name="continue" value="next">
      Continue
    </Button>,
  );

  expect(ref.current).toHaveAttribute('type', 'button');
  expect(ref.current).toHaveAttribute('name', 'continue');
  expect(ref.current).toHaveAttribute('value', 'next');
});

it('submits a form only when the caller opts into submit type', async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => event.preventDefault());
  render(
    <form onSubmit={onSubmit}>
      <Button type="submit">Save changes</Button>
    </form>,
  );

  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(onSubmit).toHaveBeenCalledTimes(1);
});
