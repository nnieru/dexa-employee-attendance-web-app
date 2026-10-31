import { expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Avatar } from './avatar.js';

const EMPLOYEE_NAME = 'Nathaniel Andrian';
const PHOTO_URL = '/api/v1/employees/me/photo';

it('should show two initials from the first and last name when no photo is given', () => {
  render(<Avatar name={EMPLOYEE_NAME} />);

  const fallback = screen.getByRole('img', { name: EMPLOYEE_NAME });
  expect(fallback).toHaveTextContent(/^NA$/);
});

it('should show one initial when the name is a single word', () => {
  render(<Avatar name="Dewi" />);

  expect(screen.getByRole('img', { name: 'Dewi' })).toHaveTextContent(/^D$/);
});

it('should show initials instead of the photo when the photo fails to load', () => {
  render(<Avatar name={EMPLOYEE_NAME} photoUrl={PHOTO_URL} photoAlt="Your profile photo" />);

  fireEvent.error(screen.getByRole('img', { name: 'Your profile photo' }));

  expect(screen.getByRole('img', { name: EMPLOYEE_NAME })).toHaveTextContent(/^NA$/);
  expect(screen.queryByRole('img', { name: 'Your profile photo' })).not.toBeInTheDocument();
});

it('should show the photo with its alt text when a photo URL is given', () => {
  render(<Avatar name={EMPLOYEE_NAME} photoUrl={PHOTO_URL} photoAlt="Your profile photo" />);

  const photo = screen.getByRole('img', { name: 'Your profile photo' });
  expect(photo.tagName).toBe('IMG');
  expect(photo).toHaveAttribute('src', PHOTO_URL);
});

it('should show initials when the photo URL is null', () => {
  render(<Avatar name={EMPLOYEE_NAME} photoUrl={null} />);

  expect(screen.getByRole('img', { name: EMPLOYEE_NAME })).toHaveTextContent(/^NA$/);
});
