export type Shape = "circle" | "squircle" | "square" | "hexagon" | "star" | "heart" | "blob";

export type PatternId = "short" | "long" | "staccato" | "heartbeat" | "ramp" | "purr";

/**
 * tap: a press plays the tap pattern and changes color.
 * hold: only holding through the timer rewards you.
 * both: quick press = tap reward, long press = timer.
 */
export type Mode = "tap" | "hold" | "both";

export interface Settings {
  mode: Mode;
  shape: Shape;
  /** Pattern played on a quick tap. */
  tapPattern: PatternId;
  /** Pattern played back at you when the hold timer completes. */
  holdPattern: PatternId;
  /** Length of the circular hold timer, in seconds. */
  holdSeconds: number;
  /** Color of the button at rest. */
  idleColor: string;
  /** Colors the button cycles through on each reward. */
  tapColors: string[];
  /** Pick the next color at random instead of in order. */
  randomColors: boolean;
  /** Snap back to the idle color after a moment instead of staying. */
  returnToIdle: boolean;
  reminders: ReminderSettings;
  /** Pressing a volume button while the app is open counts as a tap. Needs a dev build. */
  volumeButtons: boolean;
}

export interface ReminderSettings {
  enabled: boolean;
  /** Hours between reminders inside the window. */
  everyHours: number;
  /** First reminder hour (0 to 23), local time. */
  startHour: number;
  /** No reminders after this hour (0 to 23), local time. */
  endHour: number;
  /** iOS: deliver as a time-sensitive notification that breaks through Focus. */
  timeSensitive: boolean;
}

export const REMINDER_INTERVALS = [1, 2, 3, 4, 6];

export const SHAPES: { id: Shape; label: string }[] = [
  { id: "circle", label: "Circle" },
  { id: "squircle", label: "Squircle" },
  { id: "square", label: "Square" },
  { id: "hexagon", label: "Hexagon" },
  { id: "star", label: "Star" },
  { id: "heart", label: "Heart" },
  { id: "blob", label: "Blob" },
];

export const HOLD_PRESETS = [3, 5, 10, 15, 30, 60];

export const SWATCHES = [
  "#C41200", // cherry
  "#F97316", // orange
  "#FACC15", // yellow
  "#22C55E", // green
  "#14B8A6", // teal
  "#0EA5E9", // sky
  "#3B82F6", // blue
  "#8B5CF6", // violet
  "#EC4899", // pink
  "#F43F5E", // rose
  "#A3E635", // lime
  "#F4F4F5", // off white
  "#71717A", // gray
  "#18181B", // near black
];

export const DEFAULT_SETTINGS: Settings = {
  mode: "both",
  shape: "circle",
  tapPattern: "short",
  holdPattern: "heartbeat",
  holdSeconds: 5,
  idleColor: "#C41200",
  tapColors: ["#F97316", "#FACC15", "#22C55E", "#0EA5E9", "#8B5CF6", "#EC4899"],
  randomColors: false,
  returnToIdle: false,
  reminders: {
    enabled: false,
    everyHours: 2,
    startHour: 9,
    endHour: 21,
    timeSensitive: true,
  },
  volumeButtons: false,
};
