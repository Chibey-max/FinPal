# FinPal mobile

Expo (React Native + TypeScript) app for FinPal. It reads the web app's
`/api/v1` and shares `@finpal/contracts` with it. Screens so far: Overview,
Decisions and Decision detail.

## Run it

1. Start the web app, which serves the API: `pnpm --filter @finpal/web dev`
   (mock mode needs no sign-in).
2. Start the mobile app from this folder: `pnpm start`.
3. Open it:
   - **Phone:** install Expo Go, join the same Wi-Fi as this computer, and scan
     the QR code in the terminal (Camera app on iOS, Expo Go on Android).
   - **Browser preview:** press `w`, or run `pnpm web`. It renders in a
     phone-width column.
   - **Emulator:** `pnpm android` / `pnpm ios`.

The API address is derived from the machine running Metro. To point at another
server set `EXPO_PUBLIC_API_URL`, e.g. `EXPO_PUBLIC_API_URL=https://finpal.example.com pnpm start`.

If the phone cannot reach the API, allow Node.js through the Windows firewall
for private networks (ports 3000 and 8081).

## Sizing

`src/lib/screen.ts` scales sizes written for a 375pt-wide phone: `s()` for
spacing and radii, `ms()` for font sizes.

## Not yet built

Sign-in (the API authenticates with the `finpal_session` cookie; a
bearer-token path is needed on the server first), payments, review actions, new proposal, calendar,
constraints and activity.
