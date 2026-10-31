import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './button.js';
import { Dialog } from './dialog.js';

const DIALOG_TITLE = 'Edit contact';

function DialogWithTrigger({ isDismissible = true }: { isDismissible?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>
        Open contact form
      </button>
      <Dialog
        open={isOpen}
        title={DIALOG_TITLE}
        isDismissible={isDismissible}
        onClose={() => setIsOpen(false)}
        footer={<Button>Save</Button>}
      >
        <input aria-label="Phone number" />
      </Dialog>
    </>
  );
}

it('should move focus to the first focusable element when opened without an initial focus target', () => {
  render(
    <Dialog open title={DIALOG_TITLE} onClose={vi.fn()}>
      <input aria-label="Phone number" />
    </Dialog>,
  );

  expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
});

it('should cycle focus forward and backward inside the dialog when Tab and Shift+Tab are pressed', async () => {
  const user = userEvent.setup();
  render(
    <Dialog
      open
      title={DIALOG_TITLE}
      onClose={vi.fn()}
      footer={
        <>
          <Button>Cancel</Button>
          <Button>Save</Button>
        </>
      }
    >
      <input aria-label="Phone number" />
    </Dialog>,
  );
  const closeButton = screen.getByRole('button', { name: 'Close' });
  const phoneInput = screen.getByRole('textbox', { name: 'Phone number' });
  const cancelButton = screen.getByRole('button', { name: 'Cancel' });
  const saveButton = screen.getByRole('button', { name: 'Save' });

  expect(closeButton).toHaveFocus();
  await user.tab();
  expect(phoneInput).toHaveFocus();
  await user.tab();
  expect(cancelButton).toHaveFocus();
  await user.tab();
  expect(saveButton).toHaveFocus();
  await user.tab();
  expect(closeButton).toHaveFocus();

  await user.tab({ shift: true });
  expect(saveButton).toHaveFocus();
  await user.tab({ shift: true });
  expect(cancelButton).toHaveFocus();
});

it('should bring focus back into the dialog when Tab is pressed while focus is outside it', async () => {
  const user = userEvent.setup();
  render(
    <>
      <Dialog open title={DIALOG_TITLE} onClose={vi.fn()}>
        <input aria-label="Phone number" />
      </Dialog>
      <button type="button">Outside action</button>
    </>,
  );

  screen.getByRole('button', { name: 'Outside action' }).focus();
  await user.tab();

  expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
});

it('should call onClose when Escape is pressed', async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();
  render(
    <Dialog open title={DIALOG_TITLE} onClose={onClose}>
      <input aria-label="Phone number" />
    </Dialog>,
  );

  await user.keyboard('{Escape}');

  expect(onClose).toHaveBeenCalledTimes(1);
});

it('should keep the dialog open after Escape when the parent has not changed open', async () => {
  const user = userEvent.setup();
  render(
    <Dialog open title={DIALOG_TITLE} onClose={vi.fn()}>
      <input aria-label="Phone number" />
    </Dialog>,
  );

  await user.keyboard('{Escape}');

  expect(screen.getByRole('dialog', { name: DIALOG_TITLE })).toHaveAttribute('open');
});

it('should ignore Escape and the close button when the dialog is not dismissible', async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();
  render(
    <Dialog open title={DIALOG_TITLE} isDismissible={false} onClose={onClose}>
      <input aria-label="Phone number" />
    </Dialog>,
  );

  await user.keyboard('{Escape}');

  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();
});

it('should call onClose when the close button is clicked', async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();
  render(
    <Dialog open title={DIALOG_TITLE} onClose={onClose}>
      <input aria-label="Phone number" />
    </Dialog>,
  );

  await user.click(screen.getByRole('button', { name: 'Close' }));

  expect(onClose).toHaveBeenCalledTimes(1);
});

it('should restore focus to the trigger when the dialog closes after Escape', async () => {
  const user = userEvent.setup();
  render(<DialogWithTrigger />);
  const trigger = screen.getByRole('button', { name: 'Open contact form' });

  await user.click(trigger);
  expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
  await user.keyboard('{Escape}');

  expect(screen.getByRole('dialog', { hidden: true })).not.toHaveAttribute('open');
  expect(trigger).toHaveFocus();
});

it('should keep the dialog open when Escape is pressed while not dismissible', async () => {
  const user = userEvent.setup();
  render(<DialogWithTrigger isDismissible={false} />);

  await user.click(screen.getByRole('button', { name: 'Open contact form' }));
  await user.keyboard('{Escape}');

  expect(screen.getByRole('dialog', { name: DIALOG_TITLE })).toHaveAttribute('open');
});

it('should name the dialog by its title and describe it by its description', () => {
  render(
    <Dialog
      open
      title={DIALOG_TITLE}
      description="Changes are sent to HR for review."
      onClose={vi.fn()}
    >
      <input aria-label="Phone number" />
    </Dialog>,
  );

  const dialog = screen.getByRole('dialog', { name: DIALOG_TITLE });
  expect(dialog).toHaveAccessibleDescription('Changes are sent to HR for review.');
});
