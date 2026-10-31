import { createFileRoute, redirect } from '@tanstack/react-router';

// The home route has no page of its own: it sends an HR user to Employees when signed in, and to login
// otherwise. The same session check as the protected layout decides which.
export const Route = createFileRoute('/')({
  beforeLoad: ({ context }) => {
    if (context.isSignedIn()) throw redirect({ to: '/employees' });
    throw redirect({ to: '/login' });
  },
});
