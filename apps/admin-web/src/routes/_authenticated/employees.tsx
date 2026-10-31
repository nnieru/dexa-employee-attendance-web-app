import { createFileRoute } from '@tanstack/react-router';
import { PageShell } from '@dexa/ui';

// Placeholder until the employee list (T-AWEB-03) is built. Inside AppShell the page is a div: the shell owns <main>.
export const Route = createFileRoute('/_authenticated/employees')({
  component: EmployeesPlaceholderPage,
});

function EmployeesPlaceholderPage() {
  return <PageShell as="div" title="Employees" description="Employee list appears here." />;
}
