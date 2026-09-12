import { StatusBar } from "expo-status-bar";
import React from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { HomeScreen } from "./src/screens/HomeScreen";
import { SettingsProvider } from "./src/store/settings";

export default function App() {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <HomeScreen />
        <StatusBar style="auto" />
      </SettingsProvider>
    </SafeAreaProvider>
  );
}
