import { useCallback, useEffect, useState } from 'react';

export type ColorMode = 'light' | 'dark';

const STORAGE_KEY = 'storefront_color_mode';
const DARK_CLASS = 'storefront-dark';
const CHANGE_EVENT = 'storefront-color-mode-change';

function readStoredMode(): ColorMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function applyMode(mode: ColorMode) {
  document.documentElement.classList.toggle(DARK_CLASS, mode === 'dark');
}

/**
 * Storefront light/dark mode. The choice persists in localStorage and is
 * applied as .storefront-dark on <html>, which swaps the --hp-* tokens in
 * index.css. Every mounted instance stays in sync through a window event.
 */
export function useColorMode() {
  const [mode, setMode] = useState<ColorMode>(readStoredMode);

  useEffect(() => {
    applyMode(mode);
  }, [mode]);

  useEffect(() => {
    const sync = () => setMode(readStoredMode());
    window.addEventListener(CHANGE_EVENT, sync);
    return () => window.removeEventListener(CHANGE_EVENT, sync);
  }, []);

  const toggleMode = useCallback(() => {
    const next: ColorMode = readStoredMode() === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage blocked — the mode still applies for this session.
    }
    setMode(next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return { mode, isDark: mode === 'dark', toggleMode };
}
