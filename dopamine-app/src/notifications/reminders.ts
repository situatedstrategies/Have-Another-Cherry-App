import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { ReminderSettings } from "../types";

export const REMINDER_CATEGORY = "dopamine-reminder";
export const REWARD_ACTION = "reward";
export const CHANNEL_ID = "reminders";

const LINES: { title: string; body: string }[] = [
  { title: "Did the thing?", body: "Come tap. You earned it." },
  { title: "Dopamine check", body: "One tap. Little buzz. Keep going." },
  { title: "Small win?", body: "Log it with a tap." },
  { title: "Hey.", body: "Anything done since last time? Tap it." },
  { title: "Reward yourself", body: "Hold the button, watch the ring close." },
];

/**
 * The local times a reminder fires each day, starting at startHour and stepping
 * everyHours until endHour. Pure so it can be tested without a device.
 */
export function reminderTimes(r: ReminderSettings): { hour: number; minute: number }[] {
  const step = Math.max(1, Math.floor(r.everyHours));
  const start = clampHour(r.startHour);
  const end = clampHour(r.endHour);
  if (end < start) return [{ hour: start, minute: 0 }];
  const times: { hour: number; minute: number }[] = [];
  for (let h = start; h <= end; h += step) {
    times.push({ hour: h, minute: 0 });
  }
  return times;
}

function clampHour(h: number): number {
  if (!Number.isFinite(h)) return 9;
  return Math.min(23, Math.max(0, Math.round(h)));
}

export function formatHour(h: number): string {
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12} ${h < 12 ? "AM" : "PM"}`;
}

/** One-time setup: how to show notifications in the foreground, the Android channel, and the action button. */
export async function configureNotifications(): Promise<void> {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Reminders",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 60, 120, 100],
      lightColor: "#C41200",
    }).catch(() => {});
  }

  await Notifications.setNotificationCategoryAsync(REMINDER_CATEGORY, [
    {
      identifier: REWARD_ACTION,
      buttonTitle: "I did it",
      options: { opensAppToForeground: true },
    },
  ]).catch(() => {});
}

export async function requestReminderPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const asked = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: false, allowBadge: false },
  });
  return asked.granted;
}

/**
 * Replace every scheduled reminder with the set described by `r`.
 * Cancelling first keeps old schedules from piling up after a settings change.
 */
export async function syncReminders(r: ReminderSettings): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
  if (!r.enabled) return;

  const times = reminderTimes(r);
  await Promise.all(
    times.map((t, i) => {
      const line = LINES[i % LINES.length];
      return Notifications.scheduleNotificationAsync({
        content: {
          title: line.title,
          body: line.body,
          categoryIdentifier: REMINDER_CATEGORY,
          interruptionLevel: r.timeSensitive ? "timeSensitive" : "active",
          data: { reward: true },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: t.hour,
          minute: t.minute,
          channelId: CHANNEL_ID,
        },
      }).catch(() => {});
    }),
  );
}
