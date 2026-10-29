import { createFileRoute } from '@tanstack/react-router';
import { PageShell } from '@dexa/ui';

export const Route = createFileRoute('/')({ component: HomePage });

function HomePage() {
  return (
    <PageShell
      title="Dexa Employee"
      description="Application shell. Features are added per plan."
    />
  );
}
