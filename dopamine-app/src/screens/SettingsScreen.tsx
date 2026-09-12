import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Chip } from "../components/Chip";
import { Swatch } from "../components/Swatch";
import { playPattern, PATTERNS_BY_ID } from "../haptics";
import { useSettings } from "../store/settings";
import type { Theme } from "../theme";
import { HOLD_PRESETS, SHAPES, SWATCHES, type Mode, type PatternId } from "../types";

interface Props {
  visible: boolean;
  onClose: () => void;
  theme: Theme;
}

const MODES: { id: Mode; label: string; hint: string }[] = [
  {
    id: "both",
    label: "Tap or hold",
    hint: "Quick press taps. Keep holding to run the timer.",
  },
  { id: "tap", label: "Tap only", hint: "Every press is a reward. No timer." },
  { id: "hold", label: "Hold only", hint: "Only finishing the timer pays out." },
];

export function SettingsScreen({ visible, onClose, theme }: Props) {
  const { settings, update, reset, stats, resetStats } = useSettings();
  const insets = useSafeAreaInsets();

  const toggleTapColor = (color: string) => {
    const has = settings.tapColors.includes(color);
    if (has && settings.tapColors.length === 1) return; // Keep at least one.
    update({
      tapColors: has
        ? settings.tapColors.filter((c) => c !== color)
        : [...settings.tapColors, color],
    });
  };

  const choosePattern = (key: "tapPattern" | "holdPattern", id: PatternId) => {
    update({ [key]: id });
    playPattern(PATTERNS_BY_ID[id]);
  };

  const stepHold = (delta: number) => {
    const next = Math.min(600, Math.max(1, settings.holdSeconds + delta));
    update({ holdSeconds: next });
  };

  const modeHint = MODES.find((m) => m.id === settings.mode)?.hint ?? "";

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View
          style={[
            styles.header,
            { borderBottomColor: theme.border, paddingTop: Math.max(insets.top, 12) },
          ]}
        >
          <Text style={[styles.title, { color: theme.text }]}>Settings</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
            <Text style={[styles.done, { color: theme.accent }]}>Done</Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        >
          <Section title="How it rewards" theme={theme}>
            <Row>
              {MODES.map((m) => (
                <Chip
                  key={m.id}
                  label={m.label}
                  selected={settings.mode === m.id}
                  onPress={() => update({ mode: m.id })}
                  theme={theme}
                />
              ))}
            </Row>
            <Hint theme={theme}>{modeHint}</Hint>
          </Section>

          <Section title="Shape" theme={theme}>
            <Row>
              {SHAPES.map((s) => (
                <Chip
                  key={s.id}
                  label={s.label}
                  selected={settings.shape === s.id}
                  onPress={() => update({ shape: s.id })}
                  theme={theme}
                />
              ))}
            </Row>
          </Section>

          <Section title="Tap haptic" theme={theme}>
            <Row>
              {Object.values(PATTERNS_BY_ID).map((p) => (
                <Chip
                  key={p.id}
                  label={p.label}
                  selected={settings.tapPattern === p.id}
                  onPress={() => choosePattern("tapPattern", p.id)}
                  theme={theme}
                />
              ))}
            </Row>
            <Hint theme={theme}>
              {PATTERNS_BY_ID[settings.tapPattern].description} Picking one plays it.
            </Hint>
          </Section>

          {settings.mode !== "tap" && (
            <>
              <Section title="Hold timer" theme={theme}>
                <Row>
                  {HOLD_PRESETS.map((s) => (
                    <Chip
                      key={s}
                      label={`${s}s`}
                      selected={settings.holdSeconds === s}
                      onPress={() => update({ holdSeconds: s })}
                      theme={theme}
                    />
                  ))}
                </Row>
                <View style={styles.stepper}>
                  <StepButton label="-" onPress={() => stepHold(-1)} theme={theme} />
                  <Text style={[styles.stepValue, { color: theme.text }]}>
                    {settings.holdSeconds}s
                  </Text>
                  <StepButton label="+" onPress={() => stepHold(1)} theme={theme} />
                </View>
                <Hint theme={theme}>
                  Hold the button until the ring closes. Let go early and nothing happens.
                </Hint>
              </Section>

              <Section title="Timer-done haptic" theme={theme}>
                <Row>
                  {Object.values(PATTERNS_BY_ID).map((p) => (
                    <Chip
                      key={p.id}
                      label={p.label}
                      selected={settings.holdPattern === p.id}
                      onPress={() => choosePattern("holdPattern", p.id)}
                      theme={theme}
                    />
                  ))}
                </Row>
                <Hint theme={theme}>
                  {PATTERNS_BY_ID[settings.holdPattern].description} This is what buzzes back at
                  you when the ring completes.
                </Hint>
              </Section>
            </>
          )}

          <Section title="Resting color" theme={theme}>
            <Row>
              {SWATCHES.map((c) => (
                <Swatch
                  key={c}
                  color={c}
                  selected={settings.idleColor === c}
                  onPress={() => update({ idleColor: c })}
                  theme={theme}
                />
              ))}
            </Row>
          </Section>

          <Section title="Reward colors" theme={theme}>
            <Row>
              {SWATCHES.map((c) => (
                <Swatch
                  key={c}
                  color={c}
                  selected={settings.tapColors.includes(c)}
                  onPress={() => toggleTapColor(c)}
                  theme={theme}
                />
              ))}
            </Row>
            <Hint theme={theme}>
              Each reward moves to the next selected color. Pick one color to make it flip.
            </Hint>
            <ToggleRow
              label="Shuffle colors"
              value={settings.randomColors}
              onChange={(v) => update({ randomColors: v })}
              theme={theme}
            />
            <ToggleRow
              label="Snap back to resting color"
              value={settings.returnToIdle}
              onChange={(v) => update({ returnToIdle: v })}
              theme={theme}
            />
          </Section>

          <Section title="Counter" theme={theme}>
            <Text style={[styles.statLine, { color: theme.text }]}>
              Today: {stats.rewardsToday} All time: {stats.rewardsAllTime}
            </Text>
            <View style={styles.actions}>
              <TextButton label="Reset counter" onPress={resetStats} theme={theme} />
              <TextButton label="Reset all settings" onPress={reset} theme={theme} />
            </View>
          </Section>
        </ScrollView>
      </View>
    </Modal>
  );
}

function Section({
  title,
  theme,
  children,
}: {
  title: string;
  theme: Theme;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.muted }]}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

function Hint({ theme, children }: { theme: Theme; children: React.ReactNode }) {
  return <Text style={[styles.hint, { color: theme.muted }]}>{children}</Text>;
}

function ToggleRow({
  label,
  value,
  onChange,
  theme,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  theme: Theme;
}) {
  return (
    <View style={styles.toggleRow}>
      <Text style={[styles.toggleLabel, { color: theme.text }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: theme.accent, false: theme.border }}
      />
    </View>
  );
}

function StepButton({
  label,
  onPress,
  theme,
}: {
  label: string;
  onPress: () => void;
  theme: Theme;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label === "+" ? "One second longer" : "One second shorter"}
      style={({ pressed }) => [
        styles.stepButton,
        {
          borderColor: theme.border,
          backgroundColor: theme.surface,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text style={[styles.stepButtonText, { color: theme.text }]}>{label}</Text>
    </Pressable>
  );
}

function TextButton({
  label,
  onPress,
  theme,
}: {
  label: string;
  onPress: () => void;
  theme: Theme;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={8}>
      {({ pressed }) => (
        <Text style={[styles.textButton, { color: theme.accent, opacity: pressed ? 0.6 : 1 }]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 22, fontWeight: "700" },
  done: { fontSize: 17, fontWeight: "600" },
  content: { paddingHorizontal: 20, paddingTop: 8 },
  section: { marginTop: 24 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  row: { flexDirection: "row", flexWrap: "wrap" },
  hint: { fontSize: 14, lineHeight: 20, marginTop: 4 },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    marginBottom: 8,
  },
  stepButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  stepButtonText: { fontSize: 22, fontWeight: "600", lineHeight: 26 },
  stepValue: {
    fontSize: 20,
    fontWeight: "700",
    minWidth: 72,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  toggleLabel: { fontSize: 16 },
  statLine: { fontSize: 16, fontVariant: ["tabular-nums"] },
  actions: { flexDirection: "row", gap: 24, marginTop: 12 },
  textButton: { fontSize: 15, fontWeight: "600" },
});
