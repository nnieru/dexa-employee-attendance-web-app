import type { ReactNode } from 'react';

type PageShellProps = {
  children?: ReactNode;
  className?: string;
  description?: ReactNode;
  layout?: 'content' | 'form';
  title: string;
};

export function PageShell({
  children,
  className = '',
  description,
  layout = 'content',
  title,
}: PageShellProps) {
  return (
    <main className={`dexa-page-shell dexa-page-shell--${layout} ${className}`.trim()}>
      <div className="dexa-page-shell__inner">
        <header className="dexa-page-shell__heading">
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </header>
        {children}
      </div>
    </main>
  );
}
