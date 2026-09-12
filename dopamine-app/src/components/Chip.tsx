import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import type { Theme } from "../theme";

interface Props {
  label: string;
  selected: boolean;
  onPress: () => void;
  theme: Theme;
}

export function Chip({ label, selected, onPress, theme }: Props) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? theme.text : theme.surface,
          borderColor: selected ? theme.text : theme.border,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <Text style={[styles.label, { color: selected ? theme.background : theme.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    marginRight: 8,
    marginBottom: 8,
  },
  label: {
    fontSize: 15,
    fontWeight: "600",
  },
});
