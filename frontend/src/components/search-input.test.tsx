import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SearchInput } from './search-input';

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const start = (value = '') => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<SearchInput value={value} onChange={onChange} placeholder="Search students" />);
  return { user, onChange, box: screen.getByRole('searchbox', { name: 'Search students' }) };
};

describe('SearchInput', () => {
  it('waits for a pause in typing, then reports once', async () => {
    const { user, onChange, box } = start();
    await user.type(box, 'ali');
    expect(onChange).not.toHaveBeenCalled();
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('ali'));
    await pause(400);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('trims spaces from what it reports', async () => {
    const { user, onChange, box } = start();
    await user.type(box, '  omar  ');
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith('omar'));
  });

  it('shows the value it was given, and follows it when the page changes it', () => {
    const { rerender } = render(<SearchInput value="hodan" onChange={() => undefined} />);
    expect(screen.getByRole('searchbox')).toHaveValue('hodan');
    rerender(<SearchInput value="" onChange={() => undefined} />);
    expect(screen.getByRole('searchbox')).toHaveValue('');
  });

  it('has a clear button that empties the box at once, without waiting', async () => {
    const { user, onChange, box } = start('abdi');
    expect(box).toHaveValue('abdi');
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(box).toHaveValue('');
    expect(onChange).toHaveBeenCalledWith('');
    expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument();
  });

  it('does not report the value it was handed as if the person had typed it', async () => {
    const { onChange } = start('abdi');
    await pause(450);
    expect(onChange).not.toHaveBeenCalled();
  });
});
