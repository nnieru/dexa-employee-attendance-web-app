import { queryClient } from './query-client.js';
import { router } from './router.js';
import { AdminApp } from './admin-app.js';

export function App() {
  return <AdminApp queryClient={queryClient} router={router} />;
}
