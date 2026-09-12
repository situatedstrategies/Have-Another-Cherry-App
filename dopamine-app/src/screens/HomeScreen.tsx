import React, { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RewardButton } from "../components/RewardButton";
import { useSettings } from "../store/settings";
import { useTheme } from "../theme";
import { SettingsScreen } from "./SettingsScreen";

const PROMPTS = {
  both: "Did the thing? Tap it. Or hold it.",
  tap: "Did the thing? Tap it.",
  hold: "Did the thing? Hold it.",
};

export function HomeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { settings, stats, recordReward, loaded } = useSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const onReward = useCallback(() => recordReward(), [recordReward]);

  const size = Math.round(Math.min(width * 0.62, height * 0.34, 300));

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.background,
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 16,
        },
      ]}
    >
      <View style={styles.top}>
        <Text style={[styles.brand, { color: theme.text }]}>Dopamine</Text>
        <Text style={[styles.count, { color: theme.muted }]}>{stats.rewardsToday} today</Text>
      </View>

      <View style={styles.middle}>
        {loaded && (
          <RewardButton
            settings={settings}
            size={size}
            ringTrackColor={theme.ringTrack}
            onReward={onReward}
          />
        )}
        <Text style={[styles.prompt, { color: theme.muted }]}>{PROMPTS[settings.mode]}</Text>
      </View>

      <View style={styles.bottom}>
        <Pressable
          onPress={() => setSettingsOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Open settings"
          style={({ pressed }) => [
            styles.settingsButton,
            {
              borderColor: theme.border,
              backgroundColor: theme.surface,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Text style={[styles.settingsText, { color: theme.text }]}>Customize</Text>
        </Pressable>
      </View>

      <SettingsScreen
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        theme={theme}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24 },
  top: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  brand: { fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  count: { fontSize: 15, fontVariant: ["tabular-nums"] },
  middle: { flex: 1, alignItems: "center", justifyContent: "center" },
  prompt: { marginTop: 28, fontSize: 16, textAlign: "center" },
  bottom: { alignItems: "center" },
  settingsButton: {
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  settingsText: { fontSize: 16, fontWeight: "600" },
});
