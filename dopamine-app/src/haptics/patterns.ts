import type { PatternId } from "../types";

export type Intensity = "light" | "medium" | "heavy";

/** One buzz: vibrate for `ms`, then rest for `gap` before the next pulse. */
export interface Pulse {
  ms: number;
  gap: number;
  intensity: Intensity;
}

export interface Pattern {
  id: PatternId;
  label: string;
  description: string;
  pulses: Pulse[];
}

function repeat(pulse: Pulse, times: number): Pulse[] {
  return Array.from({ length: times }, () => ({ ...pulse }));
}

export const PATTERNS: Pattern[] = [
  {
    id: "short",
    label: "Short",
    description: "One crisp tick.",
    pulses: [{ ms: 40, gap: 0, intensity: "heavy" }],
  },
  {
    id: "long",
    label: "Long",
    description: "One slow, steady buzz.",
    pulses: [{ ms: 700, gap: 0, intensity: "heavy" }],
  },
  {
    id: "staccato",
    label: "Staccato",
    description: "Five quick hits in a row.",
    pulses: repeat({ ms: 40, gap: 90, intensity: "heavy" }, 5),
  },
  {
    id: "heartbeat",
    label: "Heartbeat",
    description: "Lub-dub, pause, lub-dub.",
    pulses: [
      { ms: 60, gap: 120, intensity: "heavy" },
      { ms: 100, gap: 650, intensity: "medium" },
      { ms: 60, gap: 120, intensity: "heavy" },
      { ms: 100, gap: 0, intensity: "medium" },
    ],
  },
  {
    id: "ramp",
    label: "Ramp",
    description: "Soft, firmer, firm.",
    pulses: [
      { ms: 40, gap: 130, intensity: "light" },
      { ms: 60, gap: 130, intensity: "medium" },
      { ms: 120, gap: 0, intensity: "heavy" },
    ],
  },
  {
    id: "purr",
    label: "Purr",
    description: "A dozen tiny flutters.",
    pulses: repeat({ ms: 30, gap: 50, intensity: "light" }, 12),
  },
];

export function getPattern(id: PatternId): Pattern {
  return PATTERNS.find((p) => p.id === id) ?? PATTERNS[0];
}

/** Total playing time of a pattern in milliseconds. */
export function patternDuration(pattern: Pattern): number {
  return pattern.pulses.reduce((t, p) => t + p.ms + p.gap, 0);
}

/**
 * Android's Vibrator takes [wait, buzz, wait, buzz, ...].
 * The leading 0 means "start immediately".
 */
export function toAndroidPattern(pulses: Pulse[]): number[] {
  const out: number[] = [0];
  for (const p of pulses) {
    out.push(p.ms, p.gap);
  }
  // The trailing rest after the last buzz does nothing; drop it.
  if (out.length > 1) out.pop();
  return out;
}

export interface ScheduledImpact {
  at: number;
  intensity: Intensity;
}

/**
 * iOS has no "vibrate for N ms" API through Expo, only discrete impacts.
 * A long pulse is faked by firing impacts back to back until its time is up.
 */
export const IOS_IMPACT_SPACING_MS = 45;

export function toImpactSchedule(pulses: Pulse[]): ScheduledImpact[] {
  const out: ScheduledImpact[] = [];
  let t = 0;
  for (const p of pulses) {
    if (p.ms <= IOS_IMPACT_SPACING_MS) {
      out.push({ at: t, intensity: p.intensity });
    } else {
      for (let offset = 0; offset < p.ms; offset += IOS_IMPACT_SPACING_MS) {
        out.push({ at: t + offset, intensity: p.intensity });
      }
    }
    t += p.ms + p.gap;
  }
  return out;
}
