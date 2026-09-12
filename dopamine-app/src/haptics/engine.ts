import * as Haptics from "expo-haptics";
import { Platform, Vibration } from "react-native";
import {
  getPattern,
  toAndroidPattern,
  toImpactSchedule,
  type Intensity,
  type Pattern,
} from "./patterns";
import type { PatternId } from "../types";

export interface Playback {
  cancel: () => void;
}

const IMPACT_STYLE: Record<Intensity, Haptics.ImpactFeedbackStyle> = {
  light: Haptics.ImpactFeedbackStyle.Light,
  medium: Haptics.ImpactFeedbackStyle.Medium,
  heavy: Haptics.ImpactFeedbackStyle.Heavy,
};

let current: Playback | null = null;

/**
 * Play a pattern on whatever this device supports.
 * Starting a new pattern cancels the one still playing so taps never pile up.
 */
export function playPattern(pattern: Pattern): Playback {
  current?.cancel();

  if (Platform.OS === "android") {
    Vibration.vibrate(toAndroidPattern(pattern.pulses), false);
    current = { cancel: () => Vibration.cancel() };
    return current;
  }

  // iOS (and web, where impacts are a no-op) get a timed run of impacts.
  const timers: ReturnType<typeof setTimeout>[] = [];
  for (const step of toImpactSchedule(pattern.pulses)) {
    timers.push(
      setTimeout(() => {
        Haptics.impactAsync(IMPACT_STYLE[step.intensity]).catch(() => {});
      }, step.at),
    );
  }
  current = {
    cancel: () => {
      for (const t of timers) clearTimeout(t);
    },
  };
  return current;
}

export function playPatternById(id: PatternId): Playback {
  return playPattern(getPattern(id));
}

/** A barely-there tick, used for "that did nothing" feedback like an early release. */
export function tick(): void {
  Haptics.selectionAsync().catch(() => {});
}

export function stopHaptics(): void {
  current?.cancel();
  current = null;
}
