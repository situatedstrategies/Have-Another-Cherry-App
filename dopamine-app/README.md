# Dopamine

A sensory reward button for iOS and Android, built by Situated Strategies.

You did the thing. Open the app, tap the button, and get a little buzz back. Or
hold it down, watch the ring close, and get a bigger buzz when the timer is up.

## What it does

- One big button in the shape you choose: circle, squircle, square, hexagon,
  star, heart, or blob.
- Haptic feedback you pick: short, long, staccato, heartbeat, ramp, or purr.
  Choosing a pattern in settings plays it so you can compare.
- The button changes color on every reward. Choose the resting color and the set
  of reward colors, cycle them in order or shuffle, and optionally snap back to
  the resting color after a moment.
- Hold mode: press and hold, a circular timer (1 to 600 seconds) fills around
  the button, and when it completes the phone buzzes back at you with the
  pattern you chose for it. Let go early and nothing is earned.
- Three modes: tap only, hold only, or both (quick press taps, long press runs
  the timer).
- A small counter of rewards today and all time. Everything is stored on the
  device. No account, no network.

## Stack

- Expo SDK 57, React Native 0.86, React 19, TypeScript.
- `expo-haptics` for iOS impacts, React Native `Vibration` for precise Android
  patterns.
- `react-native-svg` for the shapes and the timer ring.
- `@react-native-async-storage/async-storage` for settings and the counter.

## Run it on your phone

1. Install the Expo Go app on your iPhone or Android phone.
2. In this folder run:

   ```bash
   npm install
   npm start
   ```

3. Scan the QR code with your camera (iOS) or the Expo Go app (Android).

Haptics need a real device. Simulators and the web build show the UI but do
not vibrate.

## Build store binaries

Use EAS Build once you have an Expo account:

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform ios
eas build --platform android
```

The bundle identifier and Android package are both
`com.situatedstrategies.dopamine` (see `app.json`).

## Project layout

- `App.tsx`: providers and root screen.
- `src/types.ts`: settings model, shape list, color swatches, defaults.
- `src/haptics/patterns.ts`: the pattern definitions as pulses (buzz for N ms,
  rest for M ms) and the compilers to Android vibration arrays and iOS impact
  schedules.
- `src/haptics/engine.ts`: plays a pattern on the current platform and cancels
  the previous one.
- `src/components/RewardButton.tsx`: the button, press handling, color
  animation, and the hold timer.
- `src/components/TimerRing.tsx`: the SVG progress ring.
- `src/components/shapes.ts`: SVG paths for each shape.
- `src/screens/HomeScreen.tsx`: the main screen.
- `src/screens/SettingsScreen.tsx`: the customization sheet.
- `src/store/settings.tsx`: persistence and the settings context.

## Scripts

- `npm start`: Expo dev server.
- `npm run typecheck`: TypeScript.
- `npm run format` / `npm run format:check`: Prettier.

## Writing style

No em dashes or en dashes anywhere in this project: not in UI copy, comments,
or commit messages. Use periods, hyphens, and colons.

## Ideas for later

- Custom patterns: let the user tap out a rhythm and save it.
- Sound as an optional second channel.
- Home screen widget or lock screen shortcut so the tap is one gesture away.
- Apple Watch and Wear OS companions, where the haptics are strongest.
