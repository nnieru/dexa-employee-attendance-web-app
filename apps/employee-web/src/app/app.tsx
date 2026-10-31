import { queryClient } from './query-client.js';
import { router } from './router.js';
import { EmployeeApp } from './employee-app.js';

export function App() {
  return <EmployeeApp queryClient={queryClient} router={router} />;
}
