import { render, screen } from '@testing-library/react';
import { it, expect } from 'vitest';
import { PageShell } from './page-shell.js';

it('renders one page title with optional description and content', () => {
  render(
    <PageShell title="Kehadiran" description="Ringkasan bulan ini">
      <p>Isi halaman</p>
    </PageShell>,
  );

  expect(screen.getByRole('heading', { level: 1, name: 'Kehadiran' })).toBeInTheDocument();
  expect(screen.getByText('Ringkasan bulan ini')).toBeInTheDocument();
  expect(screen.getByText('Isi halaman')).toBeInTheDocument();
});
