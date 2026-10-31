import { createRef } from 'react';
import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Textarea } from './textarea.js';

it('should associate the visible label with the textarea when a label is given', () => {
  render(<Textarea label="Reason" />);

  expect(screen.getByLabelText('Reason')).toBeInstanceOf(HTMLTextAreaElement);
});

it('should show a required marker and mark the textarea required when required is set', () => {
  render(<Textarea label="Reason" required />);

  expect(screen.getByText('required')).toBeInTheDocument();
  const textarea = screen.getByRole('textbox', { name: 'Reason' });
  expect(textarea).toBeRequired();
});

it('should not show a required marker when required is not set', () => {
  render(<Textarea label="Reason" />);

  expect(screen.queryByText('required')).not.toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Reason' })).not.toBeRequired();
});

it('should mark the textarea invalid and describe it with the hint and error when an error is given', () => {
  render(
    <Textarea
      label="Reason"
      hint="Required when rejecting."
      error="Enter a reason to reject this request."
    />,
  );

  const textarea = screen.getByLabelText('Reason');
  expect(textarea).toHaveAttribute('aria-invalid', 'true');
  expect(textarea).toHaveAccessibleDescription(
    'Required when rejecting. Enter a reason to reject this request.',
  );
});

it('should render three rows when rows is not given', () => {
  render(<Textarea label="Reason" />);

  expect(screen.getByLabelText('Reason')).toHaveAttribute('rows', '3');
});

it('should keep three rows as the minimum when a smaller rows value is given', () => {
  render(<Textarea label="Reason" rows={1} />);

  expect(screen.getByLabelText('Reason')).toHaveAttribute('rows', '3');
});

it('should not set a length limit when maxLength is not given', () => {
  render(<Textarea label="Reason" />);

  expect(screen.getByLabelText('Reason')).not.toHaveAttribute('maxlength');
});

it('should forward the ref and registration props to the textarea when spread like react-hook-form register', async () => {
  const user = userEvent.setup();
  const ref = createRef<HTMLTextAreaElement>();
  const onChange = vi.fn();
  const onBlur = vi.fn();
  // Same shape react-hook-form's register() returns. The package is not a dependency of @dexa/ui.
  const registration = { name: 'reason', onChange, onBlur, ref };

  render(<Textarea label="Reason" {...registration} />);

  const textarea = screen.getByLabelText('Reason');
  expect(ref.current).toBe(textarea);
  expect(textarea).toHaveAttribute('name', 'reason');
  await user.type(textarea, 'A');
  expect(onChange).toHaveBeenCalled();
  await user.tab();
  expect(onBlur).toHaveBeenCalledTimes(1);
});

it('should keep the textarea readonly and ignore typing when readOnly is set', async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(
    <Textarea label="Reason" defaultValue="Laptop would not boot." readOnly onChange={onChange} />,
  );

  const textarea = screen.getByLabelText('Reason');
  expect(textarea).toHaveAttribute('readonly');
  await user.type(textarea, 'x');
  expect(textarea).toHaveValue('Laptop would not boot.');
  expect(onChange).not.toHaveBeenCalled();
});
