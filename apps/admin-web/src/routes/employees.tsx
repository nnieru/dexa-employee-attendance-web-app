import { createFileRoute } from '@tanstack/react-router';
import { PageShell } from '@dexa/ui';

// Placeholder post-login target (HR landing page). The shell, route guard and employee list are added by later tasks.
export const Route = createFileRoute('/employees')({ component: EmployeesPlaceholderPage });

function EmployeesPlaceholderPage() {
  return <PageShell title="Employees" description="Employee list appears here." />;
}
