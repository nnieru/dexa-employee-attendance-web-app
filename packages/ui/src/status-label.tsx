import type { ReactNode } from 'react';

type StatusLabelTone = 'neutral' | 'success' | 'warning' | 'error' | 'info';

export type StatusLabelProps = {
  children: ReactNode;
  className?: string;
  tone?: StatusLabelTone;
};

/**
 * Static, non-interactive status text. The tone only adds color; the visible children carry the
 * meaning, so this component never has a role and is not announced as a live region.
 */
export function StatusLabel({ children, className = '', tone = 'neutral' }: StatusLabelProps) {
  return (
    <span className={`dexa-status-label dexa-status-label--${tone} ${className}`.trim()}>
      {children}
    </span>
  );
}
