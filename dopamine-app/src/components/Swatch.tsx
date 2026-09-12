import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { Theme } from "../theme";

interface Props {
  color: string;
  selected: boolean;
  onPress: () => void;
  theme: Theme;
}

export function Swatch({ color, selected, onPress, theme }: Props) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Color ${color}`}
      accessibilityState={{ selected }}
      style={[styles.outer, { borderColor: selected ? theme.text : "transparent" }]}
    >
      <View style={[styles.inner, { backgroundColor: color, borderColor: theme.border }]}>
        {selected && (
          <View style={[styles.badge, { backgroundColor: theme.text }]}>
            <View style={styles.badgeDot} />
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    padding: 3,
    marginRight: 8,
    marginBottom: 8,
  },
  inner: {
    flex: 1,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    width: 12,
    height: 12,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#FFFFFF",
  },
});
