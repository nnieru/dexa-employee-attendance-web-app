import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderAdminApp } from '../test/admin-app-harness.js';

describe('admin-web shell', () => {
  it('should show the HR sign-in screen when a signed-out visitor opens the app', async () => {
    const router = await renderAdminApp('/');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'HR sign in' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
  });
});
