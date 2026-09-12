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
- Reminders: local notifications on a schedule you set (every 1 to 6 hours
  inside a start and end hour). Each reminder has an "I did it" button, and
  tapping either the button or the notification opens the app and fires the tap
  for you. On iOS they can be delivered as time-sensitive notifications so they
  break through Focus modes.
- Side buttons: while the app is open, either volume button counts as a tap
  (opt in). For a one-gesture trigger from anywhere, the link
  `dopamine://reward` fires a tap when it opens the app, so it can be wired to
  the iPhone Action Button or Back Tap through Shortcuts, or to Quick Tap or a
  button remapper on Android.
- A small counter of rewards today and all time. Everything is stored on the
  device. No account, no server, and the reminders are scheduled locally, so
  there is no push backend to run.

## Stack

- Expo SDK 57, React Native 0.86, React 19, TypeScript.
- `expo-haptics` for iOS impacts, React Native `Vibration` for precise Android
  patterns.
- `react-native-svg` for the shapes and the timer ring.
- `@react-native-async-storage/async-storage` for settings and the counter.
- `expo-notifications` for scheduled reminders, `expo-linking` for the deep
  link, `react-native-volume-manager` for the volume buttons.

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

Two features need a development build instead of Expo Go, because they rely on
native code Expo Go does not ship:

- Volume buttons as a trigger (`react-native-volume-manager`).
- Time-sensitive delivery on iOS (the entitlement in `app.json`).

Make one with EAS (`eas build --profile development --platform ios` or
`android`) or, with Xcode or Android Studio installed, `npx expo run:ios` /
`npx expo run:android`. Reminders themselves, the deep link, and everything
else work in Expo Go.

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
- `src/notifications/reminders.ts`: reminder schedule math and the
  `expo-notifications` setup, channel, category, and scheduling.
- `src/hardware/volumeButtons.ts`: turns volume button presses into taps.
- `src/screens/HomeScreen.tsx`: the main screen. Also where external triggers
  (notification taps, the deep link, volume buttons) are routed into the button.
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
- Home screen widget or lock screen control so the tap is one gesture away.
- Notification-only rewards: play the haptic from the "I did it" button
  without opening the app (needs a notification service extension on iOS).
- Apple Watch and Wear OS companions, where the haptics are strongest.
