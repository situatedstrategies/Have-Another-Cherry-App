import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { DEFAULT_SETTINGS, type Settings } from "../types";

const SETTINGS_KEY = "dopamine.settings.v1";
const STATS_KEY = "dopamine.stats.v1";

interface Stats {
  /** ISO date (YYYY-MM-DD) the counter belongs to. */
  day: string;
  rewardsToday: number;
  rewardsAllTime: number;
}

interface SettingsContextValue {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  reset: () => void;
  stats: Stats;
  recordReward: () => void;
  resetStats: () => void;
  loaded: boolean;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function freshStats(): Stats {
  return { day: today(), rewardsToday: 0, rewardsAllTime: 0 };
}

/** Merge stored JSON over defaults so new fields get sane values after an update. */
function mergeSettings(raw: string | null): Settings {
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const merged: Settings = { ...DEFAULT_SETTINGS, ...parsed };
    if (!Array.isArray(merged.tapColors) || merged.tapColors.length === 0) {
      merged.tapColors = DEFAULT_SETTINGS.tapColors;
    }
    if (!Number.isFinite(merged.holdSeconds) || merged.holdSeconds < 1) {
      merged.holdSeconds = DEFAULT_SETTINGS.holdSeconds;
    }
    return merged;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [stats, setStats] = useState<Stats>(freshStats);
  const [loaded, setLoaded] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [rawSettings, rawStats] = await Promise.all([
          AsyncStorage.getItem(SETTINGS_KEY),
          AsyncStorage.getItem(STATS_KEY),
        ]);
        if (cancelled) return;
        setSettings(mergeSettings(rawSettings));
        if (rawStats) {
          const parsed = JSON.parse(rawStats) as Stats;
          setStats(
            parsed.day === today() ? parsed : { ...parsed, day: today(), rewardsToday: 0 },
          );
        }
      } catch {
        // Corrupt or unavailable storage: fall through with defaults.
      } finally {
        if (!cancelled) {
          hydrated.current = true;
          setLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)).catch(() => {});
  }, [settings]);

  useEffect(() => {
    if (!hydrated.current) return;
    AsyncStorage.setItem(STATS_KEY, JSON.stringify(stats)).catch(() => {});
  }, [stats]);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const reset = useCallback(() => setSettings(DEFAULT_SETTINGS), []);

  const recordReward = useCallback(() => {
    setStats((prev) => {
      const day = today();
      const rewardsToday = prev.day === day ? prev.rewardsToday + 1 : 1;
      return { day, rewardsToday, rewardsAllTime: prev.rewardsAllTime + 1 };
    });
  }, []);

  const resetStats = useCallback(() => setStats(freshStats()), []);

  const value = useMemo<SettingsContextValue>(
    () => ({ settings, update, reset, stats, recordReward, resetStats, loaded }),
    [settings, update, reset, stats, recordReward, resetStats, loaded],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside SettingsProvider");
  return ctx;
}
