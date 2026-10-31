import type { ComponentPropsWithRef } from 'react';

type ButtonProps = Omit<ComponentPropsWithRef<'button'>, 'type'> & {
  isLoading?: boolean;
  type?: 'button' | 'submit' | 'reset';
  variant?: 'primary' | 'secondary';
};

/**
 * While busy the button is disabled, so it cannot be activated twice. The spinner sits in a reserved
 * slot beside the label, so the label keeps its text and position and the width does not change
 * (DESIGN §7). The spinner is decorative.
 */
export function Button({
  'aria-busy': ariaBusy,
  children,
  className = '',
  disabled,
  isLoading = false,
  type = 'button',
  variant = 'primary',
  ...props
}: ButtonProps) {
  const isBusy = isLoading || ariaBusy === true || ariaBusy === 'true';

  return (
    <button
      {...props}
      type={type}
      className={`dexa-button dexa-button--${variant} ${className}`.trim()}
      disabled={disabled || isBusy}
      aria-busy={isBusy || ariaBusy}
    >
      <span className="dexa-button__indicator dexa-button__indicator--leading" aria-hidden="true">
        {isBusy && <span className="dexa-button__spinner" />}
      </span>
      <span className="dexa-button__label">{children}</span>
      <span
        className="dexa-button__indicator dexa-button__indicator--trailing"
        aria-hidden="true"
      />
    </button>
  );
}
