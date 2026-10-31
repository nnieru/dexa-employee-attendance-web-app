import { createRef } from 'react';
import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TextField } from './text-field.js';

it('should associate the visible label with the input when a label is given', () => {
  render(<TextField label="Phone number" />);

  expect(screen.getByLabelText('Phone number')).toBeInstanceOf(HTMLInputElement);
});

it('should describe the input with the hint and not mark it invalid when only a hint is given', () => {
  render(<TextField label="Phone number" hint="Include the country code." />);

  const input = screen.getByLabelText('Phone number');
  expect(input).toHaveAccessibleDescription('Include the country code.');
  expect(input).not.toHaveAttribute('aria-invalid');
});

it('should mark the input invalid and describe it with the error when an error is given', () => {
  render(
    <TextField
      label="Phone number"
      hint="Include the country code."
      error="Enter a valid phone number."
    />,
  );

  const input = screen.getByLabelText('Phone number');
  expect(input).toHaveAttribute('aria-invalid', 'true');
  expect(input).toHaveAccessibleDescription(
    'Include the country code. Enter a valid phone number.',
  );
});

it('should keep a consumer aria-describedby id when an error is given', () => {
  render(
    <>
      <p id="phone-note">Saved on this device.</p>
      <TextField label="Phone number" aria-describedby="phone-note" error="Required." />
    </>,
  );

  expect(screen.getByLabelText('Phone number')).toHaveAccessibleDescription(
    'Saved on this device. Required.',
  );
});

it('should keep the input readonly and ignore typing when readOnly is set', async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(
    <TextField
      label="Company email"
      defaultValue="employee@example.com"
      readOnly
      onChange={onChange}
    />,
  );

  const input = screen.getByLabelText('Company email');
  expect(input).toHaveAttribute('readonly');
  await user.type(input, 'x');
  expect(input).toHaveValue('employee@example.com');
  expect(onChange).not.toHaveBeenCalled();
});

it('should use the given id when an id is provided', () => {
  render(<TextField id="phone" label="Phone number" />);

  expect(screen.getByLabelText('Phone number')).toHaveAttribute('id', 'phone');
});

it('should generate distinct input ids when several fields omit an id', () => {
  render(
    <>
      <TextField label="Given name" />
      <TextField label="Family name" />
    </>,
  );

  const givenName = screen.getByLabelText('Given name');
  const familyName = screen.getByLabelText('Family name');
  expect(givenName.id).not.toBe('');
  expect(familyName.id).not.toBe(givenName.id);
});

it('should forward the ref and registration props to the input when spread like react-hook-form register', async () => {
  const user = userEvent.setup();
  const ref = createRef<HTMLInputElement>();
  const onChange = vi.fn();
  const onBlur = vi.fn();
  // Same shape react-hook-form's register() returns. The package is not a dependency of @dexa/ui.
  const registration = { name: 'fullName', onChange, onBlur, ref };

  render(<TextField label="Full name" {...registration} />);

  const input = screen.getByLabelText('Full name');
  expect(ref.current).toBe(input);
  expect(input).toHaveAttribute('name', 'fullName');
  await user.type(input, 'A');
  expect(onChange).toHaveBeenCalled();
  await user.tab();
  expect(onBlur).toHaveBeenCalledTimes(1);
});
