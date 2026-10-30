import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './confirm-dialog';

function setup(props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onConfirm = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
      title="Remove this student?"
      description="Their marks stay in the records."
      confirmLabel="Remove student"
      {...props}
    />,
  );
  return { onConfirm, onOpenChange };
}

describe('ConfirmDialog', () => {
  it('names what is about to happen, and the button repeats the action', () => {
    setup();
    const dialog = screen.getByRole('alertdialog', { name: 'Remove this student?' });
    expect(dialog).toHaveAccessibleDescription('Their marks stay in the records.');
    expect(screen.getByRole('button', { name: 'Remove student' })).toBeEnabled();
  });

  it('renders nothing while closed', () => {
    setup({ open: false });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('does the action only when the confirm button is pressed', async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup();
    expect(onConfirm).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Remove student' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('closes without doing anything on Cancel or Escape', async () => {
    const user = userEvent.setup();
    const { onConfirm, onOpenChange } = setup();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledTimes(2);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('locks both buttons and ignores Escape while the action is running', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = setup({ pending: true });
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Remove student/ })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('shows extra content, such as a password box, inside the dialog', () => {
    setup({ children: <label>Your password<input /></label> });
    expect(screen.getByLabelText('Your password')).toBeInTheDocument();
  });
});
