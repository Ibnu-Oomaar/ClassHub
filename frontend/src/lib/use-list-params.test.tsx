import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { useListParams } from './use-list-params';

const DEFAULTS = { search: '', status: 'ALL' };

function setup(url: string) {
  const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>;
  return renderHook(
    () => {
      const list = useListParams(DEFAULTS);
      return { ...list, address: useLocation().search };
    },
    { wrapper },
  );
}

describe('useListParams', () => {
  it('starts from the defaults when the address says nothing', () => {
    const { result } = setup('/students');
    expect(result.current.values).toEqual({ search: '', status: 'ALL' });
    expect(result.current.page).toBe(1);
  });

  it('reads filters and the page from the address, so a shared link opens the same view', () => {
    const { result } = setup('/students?search=ali&status=ACTIVE&page=3&ignored=1');
    expect(result.current.values).toEqual({ search: 'ali', status: 'ACTIVE' });
    expect(result.current.page).toBe(3);
  });

  it('treats a page that is not a positive number as page 1', () => {
    expect(setup('/s?page=abc').result.current.page).toBe(1);
    expect(setup('/s?page=0').result.current.page).toBe(1);
    expect(setup('/s?page=-4').result.current.page).toBe(1);
  });

  it('goes back to page 1 when a filter changes', () => {
    const { result } = setup('/students?page=4');
    act(() => result.current.update({ search: 'omar' }));
    expect(result.current.values.search).toBe('omar');
    expect(result.current.page).toBe(1);
    expect(result.current.address).toBe('?search=omar');
  });

  it('keeps the page when asked to', () => {
    const { result } = setup('/students?page=4');
    act(() => result.current.update({ status: 'ACTIVE' }, { keepPage: true }));
    expect(result.current.page).toBe(4);
  });

  it('keeps the address tidy: a filter set back to its default or to nothing is removed', () => {
    const { result } = setup('/students?search=ali&status=ACTIVE');
    act(() => result.current.update({ status: 'ALL' }));
    expect(result.current.address).toBe('?search=ali');
    act(() => result.current.update({ search: '' }));
    expect(result.current.address).toBe('');
  });

  it('moves between pages, and page 1 leaves no page in the address', () => {
    const { result } = setup('/students?search=ali');
    act(() => result.current.setPage(2));
    expect(result.current.address).toBe('?search=ali&page=2');
    act(() => result.current.setPage(1));
    expect(result.current.address).toBe('?search=ali');
  });
});
