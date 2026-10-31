import type { ReactNode } from 'react';

type AlertVariant = 'neutral' | 'success' | 'warning' | 'error';

type AlertProps = {
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  variant?: AlertVariant;
};

/**
 * Errors use role="alert" so failed submissions interrupt; other variants use role="status"
 * so confirmations and guidance are announced politely.
 */
export function Alert({ action, children, className = '', variant = 'neutral' }: AlertProps) {
  const role = variant === 'error' ? 'alert' : 'status';

  return (
    <div role={role} className={`dexa-alert dexa-alert--${variant} ${className}`.trim()}>
      <p className="dexa-alert__message">{children}</p>
      {action && <div className="dexa-alert__action">{action}</div>}
    </div>
  );
}
