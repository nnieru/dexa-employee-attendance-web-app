import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { DateRangeFilter } from './date-range-filter.js';
import type { DateRange } from './date-range-presets.js';

type DateRangeFilterDemoProps = {
  error?: string;
  today: string;
};

/** Holds the applied range locally so Search and Reset can be tried. Nothing is fetched. */
function DateRangeFilterDemo({ error, today }: DateRangeFilterDemoProps) {
  const defaultRange: DateRange = { from: `${today.slice(0, 8)}01`, to: today };
  const [appliedRange, setAppliedRange] = useState(defaultRange);

  return (
    <div>
      <DateRangeFilter
        value={appliedRange}
        today={today}
        error={error}
        onSearch={setAppliedRange}
        onReset={() => setAppliedRange(defaultRange)}
      />
      <p>{`Applied range: ${appliedRange.from} to ${appliedRange.to}`}</p>
    </div>
  );
}

const meta = {
  title: 'Shared/DateRangeFilter',
  component: DateRangeFilterDemo,
  args: { today: '2026-10-31' },
  parameters: {
    docs: {
      description: {
        component:
          'From and To date inputs with Search and Reset. Quick presets (1 week, 1 month, 3 months) end on the supplied today and fill the fields without searching. The app owns the applied range, validation and fetching; the error is shown next to To.',
      },
    },
  },
} satisfies Meta<typeof DateRangeFilterDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithError: Story = {
  args: { error: 'From must be on or before To.' },
};
