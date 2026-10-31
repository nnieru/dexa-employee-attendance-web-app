import { type ComponentProps } from 'react';
import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from './confirm-dialog.js';

type ConfirmDialogTestProps = Partial<ComponentProps<typeof ConfirmDialog>>;

function renderConfirmDialog(props: ConfirmDialogTestProps = {}) {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  render(
    <ConfirmDialog
      open
      title="Delete correction request?"
      description="The request and its attachments will be removed."
      confirmLabel="Delete"
      onCancel={onCancel}
      onConfirm={onConfirm}
      {...props}
    />,
  );
  return { onCancel, onConfirm };
}

it('should call onConfirm when the confirm action is clicked', async () => {
  const user = userEvent.setup();
  const { onConfirm } = renderConfirmDialog();

  await user.click(screen.getByRole('button', { name: 'Delete' }));

  expect(onConfirm).toHaveBeenCalledTimes(1);
});

it('should call onCancel when the cancel action is clicked', async () => {
  const user = userEvent.setup();
  const { onCancel, onConfirm } = renderConfirmDialog();

  await user.click(screen.getByRole('button', { name: 'Cancel' }));

  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onConfirm).not.toHaveBeenCalled();
});

it('should focus the cancel action when opened so Enter does not confirm by accident', () => {
  renderConfirmDialog();

  expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
});

it('should call onCancel when Escape is pressed and the dialog is not busy', async () => {
  const user = userEvent.setup();
  const { onCancel } = renderConfirmDialog();

  await user.keyboard('{Escape}');

  expect(onCancel).toHaveBeenCalledTimes(1);
});

it('should name the dialog by its title and describe it by its description', () => {
  renderConfirmDialog();

  const dialog = screen.getByRole('dialog', { name: 'Delete correction request?' });
  expect(dialog).toHaveAccessibleDescription('The request and its attachments will be removed.');
});

it('should disable both actions and mark confirm busy while the confirm is in progress', () => {
  renderConfirmDialog({ isBusy: true });

  const confirmButton = screen.getByRole('button', { name: 'Delete' });
  expect(confirmButton).toBeDisabled();
  expect(confirmButton).toHaveAttribute('aria-busy', 'true');
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
});

it('should not call onConfirm when confirm is clicked while busy', async () => {
  const user = userEvent.setup();
  const { onConfirm } = renderConfirmDialog({ isBusy: true });

  await user.click(screen.getByRole('button', { name: 'Delete' }));

  expect(onConfirm).not.toHaveBeenCalled();
});

it('should ignore Escape when the dialog is busy', async () => {
  const user = userEvent.setup();
  const { onCancel } = renderConfirmDialog({ isBusy: true });

  await user.keyboard('{Escape}');

  expect(onCancel).not.toHaveBeenCalled();
});
