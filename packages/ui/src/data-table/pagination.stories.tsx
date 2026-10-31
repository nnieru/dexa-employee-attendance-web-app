import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Pagination } from './pagination.js';

type PaginationDemoProps = {
  initialPage: number;
  isDisabled: boolean;
  pageCount: number;
};

/** Holds the page locally so the controls can be tried. Nothing is fetched. */
function PaginationDemo({ initialPage, isDisabled, pageCount }: PaginationDemoProps) {
  const [page, setPage] = useState(initialPage);

  return (
    <Pagination isDisabled={isDisabled} onPageChange={setPage} page={page} pageCount={pageCount} />
  );
}

const meta = {
  title: 'Shared/Pagination',
  component: PaginationDemo,
  args: { initialPage: 2, isDisabled: false, pageCount: 5 },
  parameters: {
    docs: {
      description: {
        component:
          'Previous and next controls with a page indicator. Previous is disabled on the first page and next on the last page. The app owns the page number and fetching.',
      },
    },
  },
} satisfies Meta<typeof PaginationDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MiddlePage: Story = {};

export const FirstPage: Story = { args: { initialPage: 1 } };

export const LastPage: Story = { args: { initialPage: 5 } };

export const SinglePage: Story = { args: { initialPage: 1, pageCount: 1 } };

export const Disabled: Story = { args: { isDisabled: true } };
