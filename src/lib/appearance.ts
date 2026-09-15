// Appearance: light, dark, or follow the device. Stored per device, not per
// account, like the iOS `appearance.dart`: it describes this screen, and
// carrying it to another device someone signs in on would be presumptuous.

export type AppearanceMode = 'system' | 'light' | 'dark';

const KEY = 'appearance_mode';

export const APPEARANCE_MODES: { value: AppearanceMode; label: string; help: string }[] = [
  { value: 'system', label: 'System', help: 'Follows whatever the device is set to.' },
  { value: 'light', label: 'Light', help: 'Holds, whichever way the device goes.' },
  { value: 'dark', label: 'Dark', help: 'Holds, whichever way the device goes.' },
];

export const appearanceFromName = (name: string | null | undefined): AppearanceMode =>
  name === 'light' || name === 'dark' ? name : 'system';

export const loadSavedAppearance = (): AppearanceMode => {
  try {
    return appearanceFromName(localStorage.getItem(KEY));
  } catch {
    return 'system';
  }
};

/** Stamp the choice on <html>. "system" removes the attribute so the
 *  prefers-color-scheme rules in index.css take over. */
export const applyAppearance = (mode: AppearanceMode) => {
  const root = document.documentElement;
  if (mode === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', mode);
};

export const saveAppearance = (mode: AppearanceMode) => {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // Private mode or blocked storage: the choice still applies this visit.
  }
  applyAppearance(mode);
};
