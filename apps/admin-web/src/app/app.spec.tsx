import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { createAppRouter } from './router.js';

describe('admin-web shell', () => {
  it('renders the shared page shell on the home route', async () => {
    const router = createAppRouter(createMemoryHistory({ initialEntries: ['/'] }));

    render(
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('heading', { level: 1, name: 'Dexa HR' })).toBeInTheDocument();
  });
});
