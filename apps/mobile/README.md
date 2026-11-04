# FinPal mobile

Expo (React Native + TypeScript) app for FinPal. It talks to the web app's
`/api/v1` and shares `@finpal/contracts` with it, so it makes the same
decisions the web app does.

## Screens

Intro (the landing hero and the five steps), Overview, Calendar (the week
ahead, with spending windows), New proposal (with the "describe it"
assistant), Decisions and Decision detail (plain-words explanation, review and
PayPal order actions), Review queue, Payments (list and the PayPal state
flow), Activity, Constraints, and Sign in.

## Run it

1. Start the web app, which serves the API: `pnpm --filter @finpal/web dev`
   (mock mode needs no sign-in).
2. Start the mobile app from this folder: `pnpm start`.
3. Open it:
   - **Phone:** install Expo Go (it must support SDK 57, as this project
     does), join the same Wi-Fi as this computer, and scan the QR code in the
     terminal, or choose "Enter URL manually" and enter `exp://YOUR-PC-WIFI-IP:8081`.
   - **Browser preview:** press `w`, or run `pnpm web`. It renders in a
     phone-width column.
   - **Emulator:** `pnpm android` / `pnpm ios`.

The API address is derived from the machine running Metro. To point at another
server set `EXPO_PUBLIC_API_URL`.

If the phone cannot reach the API, allow Node.js through the Windows firewall
for private networks (ports 3000 and 8081).

## Signing in

In mock mode the server has one built-in demo user and the app signs straight
in. Against a real Supabase project the app shows a sign-in screen (sign in,
create account, reset password) and sends the user's Supabase access token as
`Authorization: Bearer …`, which the API accepts alongside the web app's
cookies. Copy `.env.example` to `.env` and set `EXPO_PUBLIC_SUPABASE_URL` and
`EXPO_PUBLIC_SUPABASE_ANON_KEY` (the same values the web app uses).

## Payments

In mock mode, "Approve in PayPal" opens a simulated Sandbox checkout. Against
real PayPal it opens PayPal's own checkout page in the in-app browser; PayPal
returns the buyer to the server, which confirms and authorizes the order, and
the app refreshes when the browser closes.

## Splash screen

The splash is the logo mark on the left with "FinPal" beside it, on the dark
theme's colour (`assets/splash-lockup.png`, regenerated from the real logo and
Rubik Bold). Two layers show it:

- **Native splash** (`expo-splash-screen` in `app.json`): what a real build
  (EAS or a development build) shows from the instant the app launches.
- **In-app splash** (`src/components/splash.tsx`): covers the wait for fonts
  and the saved theme, then fades out. It always uses the dark colour.

**Expo Go** shows its own white loading screen with plain "FinPal" text while
the app downloads. It ignores the project's splash settings, so it can only be
changed in a real build. The in-app splash takes over once the app is running.

## Look and feel

Matches the web app: Rubik, Geist Mono and Instrument Serif; the liquid orb
behind every screen (`src/components/backdrop.tsx`, the web's shader on
`expo-gl`); glass panels. Dark is the default, and the moon/sun button in the
top bar switches to light and remembers the choice. Palettes live in
`src/theme.ts`; read colours with `useTheme()`, never import them directly.

The orb costs GPU time, so it renders at half size, about 30 fps, pauses in the
background and holds still when the phone's reduce-motion setting is on.

## Sizing

`src/lib/screen.ts` scales sizes written for a 375pt-wide phone: `s()` for
spacing and radii, `ms()` for font sizes.

## Not built

The web's demo menu, and its Bryntum week grid (the Calendar screen is an
agenda instead, since Bryntum is web-only). The password-reset link in the
email opens the web app's reset page.
