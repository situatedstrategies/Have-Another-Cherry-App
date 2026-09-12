import { PATTERNS, type Pattern } from "./patterns";
import type { PatternId } from "../types";

export { playPattern, playPatternById, stopHaptics, tick } from "./engine";
export { PATTERNS, getPattern, patternDuration } from "./patterns";
export type { Pattern, Pulse, Intensity } from "./patterns";

export const PATTERNS_BY_ID = Object.fromEntries(PATTERNS.map((p) => [p.id, p])) as Record<
  PatternId,
  Pattern
>;
