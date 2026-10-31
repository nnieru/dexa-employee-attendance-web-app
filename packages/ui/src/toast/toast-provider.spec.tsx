import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { ShowToastInput } from './toast-context.js';
import { ToastProvider } from './toast-provider.js';
import { TOAST_AUTO_DISMISS_MS } from './toast-item.js';
import { useToast } from './use-toast.js';

function ToastTrigger({ input }: { input: ShowToastInput }) {
  const { showToast } = useToast();
  return (
    <button type="button" onClick={() => showToast(input)}>
      {`Show ${input.message}`}
    </button>
  );
}

function getTriggerButton(input: ShowToastInput): HTMLElement {
  return screen.getByRole('button', { name: `Show ${input.message}` });
}

function getCloseButton(message: string): HTMLElement {
  return screen.getByRole('button', { name: `Close: ${message}` });
}

/**
 * Renders the provider with one trigger per input and shows the toasts in order. Events are fired
 * synchronously so fake timers stay in control.
 */
function renderProviderWithToasts(inputs: readonly ShowToastInput[]): void {
  render(
    <ToastProvider>
      {inputs.map((input) => (
        <ToastTrigger key={input.message} input={input} />
      ))}
    </ToastProvider>,
  );
  for (const input of inputs) {
    fireEvent.click(getTriggerButton(input));
  }
}

function renderProviderAndShowToast(input: ShowToastInput): void {
  renderProviderWithToasts([input]);
}

function focusElement(element: HTMLElement): void {
  act(() => {
    element.focus();
  });
}

function advanceTimersBy(durationMs: number): void {
  act(() => {
    vi.advanceTimersByTime(durationMs);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it('should keep an empty polite live region in the DOM when no toast is shown', () => {
  render(<ToastProvider>{null}</ToastProvider>);

  const liveRegion = screen.getByRole('status');
  expect(liveRegion).toHaveAttribute('aria-live', 'polite');
  expect(liveRegion).toBeEmptyDOMElement();
});

it('should render the message inside the live region when a toast is shown', () => {
  renderProviderAndShowToast({ message: 'Changes saved.', variant: 'success' });

  expect(within(screen.getByRole('status')).getByText('Changes saved.')).toBeInTheDocument();
});

it('should remove the toast when its close button is clicked', () => {
  renderProviderAndShowToast({ message: 'Changes saved.', variant: 'success' });

  fireEvent.click(getCloseButton('Changes saved.'));

  expect(screen.queryByText('Changes saved.')).not.toBeInTheDocument();
});

it('should name each close button after its message when two toasts are open', () => {
  renderProviderWithToasts([{ message: 'Changes saved.' }, { message: 'Profile updated.' }]);

  expect(getCloseButton('Changes saved.')).toHaveAccessibleName('Close: Changes saved.');
  expect(getCloseButton('Profile updated.')).toHaveAccessibleName('Close: Profile updated.');
});

it('should close only the toast whose close button is clicked when two toasts are open', () => {
  renderProviderWithToasts([{ message: 'Changes saved.' }, { message: 'Profile updated.' }]);

  fireEvent.click(getCloseButton('Changes saved.'));

  expect(screen.queryByText('Changes saved.')).not.toBeInTheDocument();
  expect(screen.getByText('Profile updated.')).toBeInTheDocument();
});

it('should dismiss an info toast when the auto-dismiss duration elapses', () => {
  renderProviderAndShowToast({ message: 'Profile updated.' });

  advanceTimersBy(TOAST_AUTO_DISMISS_MS - 1);
  expect(screen.getByText('Profile updated.')).toBeInTheDocument();

  advanceTimersBy(1);
  expect(screen.queryByText('Profile updated.')).not.toBeInTheDocument();
});

it('should keep an error toast visible when the auto-dismiss duration elapses', () => {
  renderProviderAndShowToast({ message: 'Attendance was not recorded.', variant: 'error' });

  advanceTimersBy(TOAST_AUTO_DISMISS_MS * 10);

  expect(screen.getByText('Attendance was not recorded.')).toBeInTheDocument();
});

it('should keep an info toast visible while the pointer hovers over it', () => {
  renderProviderAndShowToast({ message: 'Profile updated.' });
  fireEvent.mouseEnter(screen.getByText('Profile updated.'));

  advanceTimersBy(TOAST_AUTO_DISMISS_MS);

  expect(screen.getByText('Profile updated.')).toBeInTheDocument();
});

it('should dismiss an info toast after only its remaining time when the pointer leaves', () => {
  renderProviderAndShowToast({ message: 'Profile updated.' });
  advanceTimersBy(TOAST_AUTO_DISMISS_MS - 1000);
  fireEvent.mouseEnter(screen.getByText('Profile updated.'));
  fireEvent.mouseLeave(screen.getByText('Profile updated.'));

  advanceTimersBy(999);
  expect(screen.getByText('Profile updated.')).toBeInTheDocument();

  advanceTimersBy(1);
  expect(screen.queryByText('Profile updated.')).not.toBeInTheDocument();
});

it('should move focus to the next toast close button when the focused toast is closed', () => {
  renderProviderWithToasts([{ message: 'Changes saved.' }, { message: 'Profile updated.' }]);
  focusElement(getCloseButton('Changes saved.'));

  fireEvent.click(getCloseButton('Changes saved.'));

  expect(getCloseButton('Profile updated.')).toHaveFocus();
});

it('should move focus to the previous toast close button when the last focused toast is closed', () => {
  renderProviderWithToasts([{ message: 'Changes saved.' }, { message: 'Profile updated.' }]);
  focusElement(getCloseButton('Profile updated.'));

  fireEvent.click(getCloseButton('Profile updated.'));

  expect(getCloseButton('Changes saved.')).toHaveFocus();
});

it('should move focus to the live region when the only focused toast is closed', () => {
  renderProviderAndShowToast({ message: 'Changes saved.' });
  focusElement(getCloseButton('Changes saved.'));

  fireEvent.click(getCloseButton('Changes saved.'));

  expect(screen.getByRole('status')).toHaveFocus();
});

it('should keep focus where it is when an unfocused toast auto-dismisses', () => {
  const input: ShowToastInput = { message: 'Profile updated.' };
  renderProviderAndShowToast(input);
  focusElement(getTriggerButton(input));

  advanceTimersBy(TOAST_AUTO_DISMISS_MS);

  expect(screen.queryByText('Profile updated.')).not.toBeInTheDocument();
  expect(getTriggerButton(input)).toHaveFocus();
});

it('should render the link action with its href when the toast has a link', () => {
  renderProviderAndShowToast({
    message: 'Employee profile changed.',
    link: { label: 'View employee', href: '/employees/42' },
  });

  expect(screen.getByRole('link', { name: 'View employee' })).toHaveAttribute(
    'href',
    '/employees/42',
  );
});

it('should throw a clear error when useToast is used outside ToastProvider', () => {
  function ComponentWithoutProvider() {
    useToast();
    return null;
  }
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

  expect(() => render(<ComponentWithoutProvider />)).toThrow(
    'useToast must be used inside a ToastProvider.',
  );

  consoleErrorSpy.mockRestore();
});

it('should show the optional title above the message when the toast has a title', () => {
  renderProviderAndShowToast({
    title: 'Profile updated',
    message: 'Rina Kusuma changed: phone number.',
  });

  expect(screen.getByText('Profile updated')).toBeInTheDocument();
  expect(screen.getByText('Rina Kusuma changed: phone number.')).toBeInTheDocument();
});
