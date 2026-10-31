import type { ComponentPropsWithRef } from 'react';
import { Icon, type IconName } from './icon.js';

type IconButtonProps = Omit<ComponentPropsWithRef<'button'>, 'type' | 'children'> & {
  /** Required: an icon-only control has no visible text, so its accessible name must come from the caller. */
  'aria-label': string;
  iconName: IconName;
  type?: 'button' | 'submit' | 'reset';
};

/**
 * A 44px square control that shows only an icon. The aria-label is mandatory so every icon-only
 * control has a name; the type defaults to button so it never submits a surrounding form by accident.
 */
export function IconButton({
  className = '',
  iconName,
  type = 'button',
  ...props
}: IconButtonProps) {
  return (
    <button {...props} type={type} className={`dexa-icon-button ${className}`.trim()}>
      <Icon name={iconName} />
    </button>
  );
}
