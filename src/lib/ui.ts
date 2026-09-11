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
} as const;
