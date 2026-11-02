import { PageShell } from '@dexa/ui';

type ComingSoonPageProps = {
  title: string;
  description: string;
};

/**
 * Placeholder for an HR page that a later task builds. Its empty state says the page is not available
 * yet; it offers no action and shows no fake counts or records.
 */
export function ComingSoonPage({ title, description }: ComingSoonPageProps) {
  return (
    <PageShell as="div" title={title} description={description}>
      <section className="hr-empty-state">
        <p className="hr-empty-state__title">Coming soon</p>
        <p className="hr-empty-state__text">This page is not available yet.</p>
      </section>
    </PageShell>
  );
}
