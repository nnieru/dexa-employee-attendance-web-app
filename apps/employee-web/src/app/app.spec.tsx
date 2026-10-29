import { render, screen } from '@testing-library/react';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { routeTree } from '../routeTree.gen.js';

describe('employee-web shell', () => {
  it('renders the shared page shell on the home route', async () => {
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    });

    render(<RouterProvider router={router} />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Dexa Employee' }),
    ).toBeInTheDocument();
  });
});
