import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { useTheme } from '../useTheme';

interface ListenerBag {
  listeners: Array<(event: MediaQueryListEvent) => void>;
  matches: boolean;
}

function installMatchMedia(initialMatch: boolean): ListenerBag {
  const bag: ListenerBag = { listeners: [], matches: initialMatch };

  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation(() => ({
      matches: bag.matches,
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addEventListener: (_event: string, callback: (event: MediaQueryListEvent) => void) => {
        bag.listeners.push(callback);
      },
      removeEventListener: (_event: string, callback: (event: MediaQueryListEvent) => void) => {
        bag.listeners = bag.listeners.filter((listener) => listener !== callback);
      },
      dispatchEvent: () => true,
    }))
  );

  return bag;
}

describe('useTheme', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.dataset.theme = '';
    document.documentElement.style.colorScheme = '';
  });

  it('resolves stored explicit theme and writes root attributes', async () => {
    installMatchMedia(false);
    window.localStorage.setItem('graphpulse.theme.v1', 'dark');

    const { result } = renderHook(() => useTheme());

    expect(result.current.themePreference).toBe('dark');
    expect(result.current.resolvedTheme).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('resolves system theme and responds to media query changes', () => {
    const bag = installMatchMedia(false);

    const { result } = renderHook(() => useTheme());

    expect(result.current.themePreference).toBe('system');
    expect(result.current.resolvedTheme).toBe('light');

    bag.matches = true;
    act(() => {
      for (const listener of bag.listeners) {
        listener({ matches: true } as MediaQueryListEvent);
      }
    });

    expect(result.current.resolvedTheme).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('cycles theme preference and persists key', () => {
    installMatchMedia(false);

    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.cycleTheme();
    });
    expect(result.current.themePreference).toBe('light');
    expect(window.localStorage.getItem('graphpulse.theme.v1')).toBe('light');

    act(() => {
      result.current.cycleTheme();
    });
    expect(result.current.themePreference).toBe('dark');
    expect(window.localStorage.getItem('graphpulse.theme.v1')).toBe('dark');

    act(() => {
      result.current.cycleTheme();
    });
    expect(result.current.themePreference).toBe('system');
    expect(window.localStorage.getItem('graphpulse.theme.v1')).toBe('system');
  });
});
