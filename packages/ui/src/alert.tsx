import type { ReactNode } from 'react';
import { IconButton } from './icon-button.js';
import { Icon, type IconName } from './icon.js';

type AlertVariant = 'neutral' | 'success' | 'warning' | 'error';

type AlertProps = {
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** When given, a close icon button is shown and calls this handler. The alert does not hide itself. */
  onDismiss?: () => void;
  variant?: AlertVariant;
};

const VARIANT_ICON_NAMES: Record<AlertVariant, IconName> = {
  error: 'info',
  neutral: 'info',
  success: 'check',
  warning: 'info',
};

/**
 * Errors use role="alert" so failed submissions interrupt; other variants use role="status"
 * so confirmations and guidance are announced politely. The icon is decorative: the message text
 * carries the meaning.
 */
export function Alert({
  action,
  children,
  className = '',
  onDismiss,
  variant = 'neutral',
}: AlertProps) {
  const role = variant === 'error' ? 'alert' : 'status';

  return (
    <div role={role} className={`dexa-alert dexa-alert--${variant} ${className}`.trim()}>
      <Icon name={VARIANT_ICON_NAMES[variant]} className="dexa-alert__icon" />
      <p className="dexa-alert__message">{children}</p>
      {action && <div className="dexa-alert__action">{action}</div>}
      {onDismiss && (
        <IconButton
          className="dexa-alert__dismiss"
          aria-label="Dismiss message"
          iconName="x"
          onClick={onDismiss}
        />
      )}
    </div>
  );
}
