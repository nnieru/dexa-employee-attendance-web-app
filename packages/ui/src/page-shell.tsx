import type { ReactNode } from 'react';

type PageShellProps = {
  /**
   * The page's landmark element. Use 'div' inside AppShell, which already renders the page's single <main>; a
   * standalone page such as the login screen keeps the default 'main'.
   */
  as?: 'main' | 'div';
  children?: ReactNode;
  className?: string;
  description?: ReactNode;
  layout?: 'content' | 'form';
  title: string;
};

export function PageShell({
  as: Container = 'main',
  children,
  className = '',
  description,
  layout = 'content',
  title,
}: PageShellProps) {
  return (
    <Container className={`dexa-page-shell dexa-page-shell--${layout} ${className}`.trim()}>
      <div className="dexa-page-shell__inner">
        <header className="dexa-page-shell__heading">
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </header>
        {children}
      </div>
    </Container>
  );
}
