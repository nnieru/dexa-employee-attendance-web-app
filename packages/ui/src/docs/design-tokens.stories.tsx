import type { Meta, StoryObj } from '@storybook/react-vite';

const colorTokens = [
  ['--color-brand', 'Primary action, page heading'],
  ['--color-brand-hover', 'Primary hover and pressed'],
  ['--color-brand-soft', 'Selected navigation background'],
  ['--color-accent', 'Small non-text artwork accent'],
  ['--color-canvas', 'Application background'],
  ['--color-surface', 'Forms, cards, dialogs'],
  ['--color-surface-muted', 'Table headers, read-only fields'],
  ['--color-text', 'Body text and labels'],
  ['--color-text-muted', 'Supporting text'],
  ['--color-border', 'Dividers'],
  ['--color-border-control', 'Control outlines'],
  ['--color-success-surface', 'Success state background'],
  ['--color-warning-surface', 'Warning state background'],
  ['--color-info-surface', 'Information state background'],
  ['--color-error-surface', 'Error state background'],
] as const;

const spaceTokens = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16] as const;

const typeRoles = [
  ['Page title', '--font-size-h1', 700],
  ['Section title', '--font-size-h2', 700],
  ['Subsection', '--font-size-h3', 700],
  ['Lead', '--font-size-lead', 400],
  ['Body', '--font-size-body', 400],
  ['Supporting', '--font-size-small', 400],
  ['Caption', '--font-size-caption', 400],
] as const;

function Colors() {
  return (
    <ul style={{ display: 'grid', gap: 'var(--space-3)', padding: 0, listStyle: 'none' }}>
      {colorTokens.map(([token, use]) => (
        <li key={token} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <span
            aria-hidden="true"
            style={{
              width: '3rem',
              height: '3rem',
              borderRadius: 'var(--radius-control)',
              border: '1px solid var(--color-border)',
              background: `var(${token})`,
            }}
          />
          <span>
            <code>{token}</code>
            <br />
            <small>{use}</small>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Typography() {
  return (
    <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
      {typeRoles.map(([role, sizeToken, weight]) => (
        <p key={role} style={{ margin: 0, fontSize: `var(${sizeToken})`, fontWeight: weight }}>
          {role} <small style={{ fontWeight: 400 }}>({sizeToken})</small>
        </p>
      ))}
    </div>
  );
}

function Spacing() {
  return (
    <ul style={{ display: 'grid', gap: 'var(--space-2)', padding: 0, listStyle: 'none' }}>
      {spaceTokens.map((step) => (
        <li key={step} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <code style={{ width: '6rem' }}>--space-{step}</code>
          <span
            aria-hidden="true"
            style={{
              height: '1rem',
              width: `var(--space-${step})`,
              background: 'var(--color-brand)',
            }}
          />
        </li>
      ))}
    </ul>
  );
}

const meta = {
  title: 'Design System/Tokens',
  parameters: {
    docs: {
      description: {
        component:
          'Tokens come from tokens.css, which implements docs/DESIGN.md. Change the document and the file together.',
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const ColorPalette: Story = { render: () => <Colors /> };
export const TypeScale: Story = { render: () => <Typography /> };
export const SpacingScale: Story = { render: () => <Spacing /> };
