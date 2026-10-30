import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider, useTheme } from './theme-provider';

function Probe() {
  const { theme, toggle } = useTheme();
  return (
    <button type="button" onClick={toggle}>
      theme is {theme}
    </button>
  );
}

const renderProbe = () =>
  render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );

const systemPrefersDark = (dark: boolean) => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: dark }) as never;
};

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove('dark');
  document.head.innerHTML = '<meta name="theme-color" content="#F3F6FB">';
  systemPrefersDark(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ThemeProvider', () => {
  it('starts light when nothing is saved and the system has no preference', () => {
    renderProbe();
    expect(screen.getByRole('button')).toHaveTextContent('theme is light');
    expect(document.documentElement).not.toHaveClass('dark');
  });

  it('follows a dark system when nothing is saved', () => {
    systemPrefersDark(true);
    renderProbe();
    expect(screen.getByRole('button')).toHaveTextContent('theme is dark');
    expect(document.documentElement).toHaveClass('dark');
  });

  it('prefers the saved choice over the system', () => {
    systemPrefersDark(true);
    localStorage.setItem('classhub-theme', 'light');
    renderProbe();
    expect(screen.getByRole('button')).toHaveTextContent('theme is light');
  });

  it('ignores a saved value it does not know', () => {
    localStorage.setItem('classhub-theme', 'purple');
    renderProbe();
    expect(screen.getByRole('button')).toHaveTextContent('theme is light');
  });

  it('switches, remembers the choice, and recolours the browser bar', async () => {
    const user = userEvent.setup();
    renderProbe();
    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toHaveTextContent('theme is dark');
    expect(document.documentElement).toHaveClass('dark');
    expect(localStorage.getItem('classhub-theme')).toBe('dark');
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute('content', '#0F1A16');
    await user.click(screen.getByRole('button'));
    expect(document.documentElement).not.toHaveClass('dark');
    expect(localStorage.getItem('classhub-theme')).toBe('light');
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute('content', '#F3F6FB');
  });

  it('still switches for this visit when the browser blocks storage', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const user = userEvent.setup();
    renderProbe();
    await user.click(screen.getByRole('button'));
    expect(document.documentElement).toHaveClass('dark');
  });

  it('refuses to be used outside its provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Probe />)).toThrow(/inside ThemeProvider/);
  });
});
