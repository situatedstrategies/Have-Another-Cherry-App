// The small uppercase section label used across the screens. One spelling,
// so a search finds every instance.
export const labelClass = 'text-xs font-bold uppercase tracking-wider text-natural-muted';

// The palette tokens from src/index.css, for the few places (chart tooltips,
// SVG props) that take a literal colour rather than a Tailwind class. Keep in
// step with the CSS variables of the same names.
export const colors = {
  text: '#18181B',
  sidebar: '#E4E4E7',
  border: '#D4D4D8',
  primary: '#C41200',
  accent: '#71717A',
  muted: '#52525B',
  subtle: '#A1A1AA',
} as const;

// Category colours. Eight hues, picked by a hash of the trimmed, lower-cased
// name, so "Groceries" is the same green on every device and in the Flutter
// app (CherryCategory.of in lib/core/categories.dart hashes the same way:
// h = (h * 31 + codeUnit) & 0x7fffffff over the code units, index = h % 8).
// Change the list and the hash together, in both clients.
export const CATEGORY_COLORS = [
  '#C41200', // cherry
  '#9A3412', // clay
  '#4D7C0F', // moss
  '#0F766E', // teal
  '#3730A3', // indigo
  '#7E22CE', // plum
  '#475569', // slate
  '#A16207', // ochre
] as const;

export const categoryHash = (name: string): number => {
  const key = name.trim().toLowerCase();
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) & 0x7fffffff;
  }
  return h;
};

/** The hex colour for a category name; the muted grey for an empty name. */
export const categoryColor = (name: string): string => {
  if (!name.trim()) return colors.muted;
  return CATEGORY_COLORS[categoryHash(name) % CATEGORY_COLORS.length];
};

/** A 10% tint of a hex colour, for the ground behind a category bubble. */
export const tintOf = (hex: string, alpha = 0.1): string => {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
};
