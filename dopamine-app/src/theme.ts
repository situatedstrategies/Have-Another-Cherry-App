import { useColorScheme } from "react-native";

export interface Theme {
  dark: boolean;
  background: string;
  surface: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  ringTrack: string;
}

const light: Theme = {
  dark: false,
  background: "#F4F4F5",
  surface: "#FFFFFF",
  border: "#D4D4D8",
  text: "#18181B",
  muted: "#52525B",
  accent: "#C41200",
  ringTrack: "#E4E4E7",
};

const dark: Theme = {
  dark: true,
  background: "#0B0B0F",
  surface: "#18181B",
  border: "#3F3F46",
  text: "#F4F4F5",
  muted: "#A1A1AA",
  accent: "#FF4D3D",
  ringTrack: "#27272A",
};

export function useTheme(): Theme {
  return useColorScheme() === "dark" ? dark : light;
}
