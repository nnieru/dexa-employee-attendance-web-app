import { useState, type ComponentProps, type MouseEvent } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './button.js';

function ButtonDemo(props: ComponentProps<typeof Button>) {
  const [isActivated, setIsActivated] = useState(false);
  const { children, onClick, ...buttonProps } = props;

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    onClick?.(event);
    setIsActivated(true);
  }

  return (
    <div>
      <Button {...buttonProps} onClick={handleClick}>
        {children}
      </Button>
      {isActivated && <p role="status">Local button demo activated.</p>}
    </div>
  );
}

const meta = {
  title: 'Shared/Button',
  component: Button,
  args: { children: 'Continue' },
  parameters: {
    docs: {
      description: {
        component: 'Button component states only. Stories do not perform product actions.',
      },
    },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { children: 'Run primary demo' },
  render: (args) => <ButtonDemo {...args} />,
};

export const Secondary: Story = {
  args: { variant: 'secondary', children: 'Run secondary demo' },
  render: (args) => <ButtonDemo {...args} />,
};

export const Disabled: Story = { args: { disabled: true } };

export const Busy: Story = {
  args: { isLoading: true, children: 'Continue' },
};
