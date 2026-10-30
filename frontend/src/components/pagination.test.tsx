import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Pagination } from './pagination';

const meta = (overrides: Partial<{ page: number; limit: number; total: number; totalPages: number }> = {}) => ({
  page: 2,
  limit: 20,
  total: 45,
  totalPages: 3,
  ...overrides,
});

describe('Pagination', () => {
  it('shows nothing when there are no records', () => {
    const { container } = render(<Pagination meta={meta({ total: 0, totalPages: 0, page: 1 })} onPage={() => undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('says which records are on screen', () => {
    render(<Pagination meta={meta()} onPage={() => undefined} />);
    expect(screen.getByText('Showing 21 to 40 of 45')).toBeInTheDocument();
  });

  it('stops the last range at the real total', () => {
    render(<Pagination meta={meta({ page: 3 })} onPage={() => undefined} />);
    expect(screen.getByText('Showing 41 to 45 of 45')).toBeInTheDocument();
  });

  it('offers no page buttons when everything fits on one page', () => {
    render(<Pagination meta={meta({ page: 1, total: 7, totalPages: 1 })} onPage={() => undefined} />);
    expect(screen.getByText('Showing 1 to 7 of 7')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('moves to the previous and next page', async () => {
    const onPage = vi.fn();
    const user = userEvent.setup();
    render(<Pagination meta={meta()} onPage={onPage} />);
    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(onPage).toHaveBeenLastCalledWith(3);
    await user.click(screen.getByRole('button', { name: /previous/i }));
    expect(onPage).toHaveBeenLastCalledWith(1);
  });

  it('cannot go before the first page or past the last', () => {
    const { rerender } = render(<Pagination meta={meta({ page: 1 })} onPage={() => undefined} />);
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /next/i })).toBeEnabled();
    rerender(<Pagination meta={meta({ page: 3 })} onPage={() => undefined} />);
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
  });
});
