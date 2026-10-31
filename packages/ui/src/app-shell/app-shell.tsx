import { useId, type ReactNode } from 'react';
import {
  AppShellNavigation,
  type AppShellNavItem,
  type AppShellRenderLink,
} from './app-shell-navigation.js';

export type AppShellProps = {
  /** The Dexa wordmark or app name, supplied by the app. The shell does not hard-code a logo. */
  brand: ReactNode;
  children: ReactNode;
  className?: string;
  /** Right side of the header, for example a notification bell or the account control. */
  headerActions?: ReactNode;
  /** Accessible name of both navigation landmarks; only one is visible at a time. */
  navLabel?: string;
  navItems: ReadonlyArray<AppShellNavItem>;
  onLogout: () => void;
  renderLink?: AppShellRenderLink;
};

/**
 * Header, navigation and main region for the employee and HR apps (DESIGN §6). The layout switches
 * with CSS only: a side rail in landscape at 1024px and wider, and a bottom bar everywhere else.
 * The hidden navigation is `display: none`, so assistive technology sees one landmark.
 */
export function AppShell({
  brand,
  children,
  className = '',
  headerActions,
  navItems,
  navLabel = 'Main',
  onLogout,
  renderLink,
}: AppShellProps) {
  const mainId = useId();

  return (
    <div className={`dexa-app-shell ${className}`.trim()}>
      <a className="dexa-app-shell__skip-link" href={`#${mainId}`}>
        Skip to main content
      </a>
      <header className="dexa-app-shell__header">
        <div className="dexa-app-shell__brand">{brand}</div>
        <div className="dexa-app-shell__header-actions">{headerActions}</div>
      </header>
      <div className="dexa-app-shell__body">
        <AppShellNavigation
          items={navItems}
          label={navLabel}
          layout="rail"
          onLogout={onLogout}
          renderLink={renderLink}
        />
        {/* tabIndex -1 lets the skip link move focus here; the outline is removed in the stylesheet. */}
        <main id={mainId} className="dexa-app-shell__main" tabIndex={-1}>
          {children}
        </main>
        <AppShellNavigation
          items={navItems}
          label={navLabel}
          layout="bottom"
          onLogout={onLogout}
          renderLink={renderLink}
        />
      </div>
    </div>
  );
}
