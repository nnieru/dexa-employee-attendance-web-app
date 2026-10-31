import { expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Icon } from './icon.js';

it('should hide the icon from assistive technology and keep it out of the tab order', () => {
  const { container } = render(<Icon name="check" />);

  const svg = container.querySelector('svg');
  expect(svg).toHaveAttribute('aria-hidden', 'true');
  expect(svg).toHaveAttribute('focusable', 'false');
});

it('should render the 20px size when no size is given', () => {
  const { container } = render(<Icon name="clock" />);

  expect(container.querySelector('svg')).toHaveClass('dexa-icon', 'dexa-icon--default');
});

it('should render the 16px size when the size is small', () => {
  const { container } = render(<Icon name="calendar" size="small" />);

  expect(container.querySelector('svg')).toHaveClass('dexa-icon', 'dexa-icon--small');
});

it('should draw the icon with a 24 unit viewBox and a currentColor stroke', () => {
  const { container } = render(<Icon name="bell" />);

  const svg = container.querySelector('svg');
  expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
  expect(svg).toHaveAttribute('stroke', 'currentColor');
  expect(svg).toHaveAttribute('fill', 'none');
  expect(svg?.querySelectorAll('path, circle, rect, line, polyline').length).toBeGreaterThan(0);
});
