// Appearance: light, or dark by explicit choice. Stored per device, not per
// account, like the iOS `appearance.dart`: it describes this screen, and
// carrying it to another device someone signs in on would be presumptuous.
//
// There is deliberately no "follow the device" option for now. Following the
// device put everyone whose phone was set to dark onto the dark palette
// without asking, and that palette is not yet readable on every surface.
// Light is the default until it is; dark stays available to anyone who
// picks it. A previously saved "system" choice reads as light.

export type AppearanceMode = 'light' | 'dark';

const KEY = 'appearance_mode';

export const APPEARANCE_MODES: { value: AppearanceMode; label: string; help: string }[] = [
  { value: 'light', label: 'Light', help: 'The default. Cream, grey and cherry red.' },
  { value: 'dark', label: 'Dark', help: 'Early: some screens are still being tuned.' },
];

export const appearanceFromName = (name: string | null | undefined): AppearanceMode =>
  name === 'dark' ? 'dark' : 'light';

export const loadSavedAppearance = (): AppearanceMode => {
  try {
    return appearanceFromName(localStorage.getItem(KEY));
  } catch {
    return 'light';
  }
};

/** Stamp the choice on <html>. Only data-theme="dark" changes anything in
 *  index.css; light is stamped too so the attribute always states the
 *  choice rather than leaving it to inference. */
export const applyAppearance = (mode: AppearanceMode) => {
  document.documentElement.setAttribute('data-theme', mode);
};

export const saveAppearance = (mode: AppearanceMode) => {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // Private mode or blocked storage: the choice still applies this visit.
  }
  applyAppearance(mode);
};
