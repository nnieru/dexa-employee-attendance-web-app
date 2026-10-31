import type { ReactNode } from 'react';
import { Icon, type IconName } from '../icon.js';

export type AppShellNavCount = {
  /** Shown beside the label. Omit `count` on the item when there is nothing to show. */
  value: number;
  /** Read after the label, for example "pending" or "unread": "Approvals, 3 pending". */
  unit: string;
};

type AppShellNavTarget =
  { href: string; onSelect?: undefined } | { href?: undefined; onSelect: () => void };

export type AppShellNavItem = AppShellNavTarget & {
  id: string;
  label: string;
  icon: IconName;
  isActive: boolean;
  count?: AppShellNavCount;
};

export type AppShellLinkProps = {
  href: string;
  className: string;
  children: ReactNode;
  'aria-current'?: 'page';
};

/**
 * Lets the app render an item as its router link, for example TanStack Router's `Link` with
 * `to={href}`. The shell does not depend on a router; without this prop items render plain anchors.
 */
export type AppShellRenderLink = (props: AppShellLinkProps) => ReactNode;

type AppShellNavigationProps = {
  items: ReadonlyArray<AppShellNavItem>;
  label: string;
  layout: 'bottom' | 'rail';
  onLogout: () => void;
  renderLink?: AppShellRenderLink;
};

/**
 * One navigation list per layout. The shell renders the rail and the bottom bar, and CSS shows only
 * one of them, so each layout gets its own landmark and only the visible one reaches assistive tech.
 */
export function AppShellNavigation({
  items,
  label,
  layout,
  onLogout,
  renderLink,
}: AppShellNavigationProps) {
  return (
    <nav className={`dexa-app-shell__nav dexa-app-shell__nav--${layout}`} aria-label={label}>
      <ul className="dexa-app-shell__list">
        {items.map((item) => (
          <li key={item.id} className="dexa-app-shell__list-item">
            <NavigationItem item={item} renderLink={renderLink} />
          </li>
        ))}
        <li className="dexa-app-shell__list-item dexa-app-shell__list-item--logout">
          <button
            type="button"
            className="dexa-app-shell__item dexa-app-shell__item--logout"
            onClick={onLogout}
          >
            <Icon name="logout" />
            <span className="dexa-app-shell__label">Logout</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}

function NavigationItem({
  item,
  renderLink,
}: {
  item: AppShellNavItem;
  renderLink?: AppShellRenderLink;
}) {
  const ariaCurrent = item.isActive ? 'page' : undefined;
  const content = (
    <>
      <Icon name={item.icon} />
      <span className="dexa-app-shell__label">{item.label}</span>
      {item.count && (
        <>
          <span className="dexa-app-shell__count" aria-hidden="true">
            {item.count.value}
          </span>
          <span className="dexa-app-shell__sr-only">
            {`, ${item.count.value} ${item.count.unit}`}
          </span>
        </>
      )}
    </>
  );

  if (item.href !== undefined) {
    const linkProps: AppShellLinkProps = {
      href: item.href,
      className: 'dexa-app-shell__item',
      children: content,
      'aria-current': ariaCurrent,
    };
    return renderLink ? renderLink(linkProps) : <a {...linkProps}>{content}</a>;
  }

  return (
    <button
      type="button"
      className="dexa-app-shell__item"
      aria-current={ariaCurrent}
      onClick={item.onSelect}
    >
      {content}
    </button>
  );
}
