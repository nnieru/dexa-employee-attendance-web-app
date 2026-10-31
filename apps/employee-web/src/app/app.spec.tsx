import { screen } from '@testing-library/react';
import { renderEmployeeApp } from '../test/employee-app-harness.js';

describe('employee-web shell', () => {
  it('should show the login screen when a signed-out employee opens the home route', async () => {
    const router = await renderEmployeeApp('/');

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });
});
