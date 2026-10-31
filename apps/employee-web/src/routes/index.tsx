import { createFileRoute, redirect } from '@tanstack/react-router';

// The home route has no page of its own: it sends the employee to the attendance page when signed in,
// and to login otherwise. The same session check as the protected layout decides which.
export const Route = createFileRoute('/')({
  beforeLoad: ({ context }) => {
    if (context.isSignedIn()) throw redirect({ to: '/attendance' });
    throw redirect({ to: '/login' });
  },
});
