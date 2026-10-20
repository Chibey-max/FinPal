// Bryntum Calendar is served as its prebuilt UMD bundle instead of being
// compiled by Next: its 5 MB obfuscated module drove the dev server past
// 10 GB of memory. Keep this in sync with @bryntum/calendar in package.json
// (bryntum-assets.test.ts checks); it versions the immutable asset URLs.
export const BRYNTUM_VERSION = "7.3.7";

/** Files the asset route may serve, with their content types. */
export const BRYNTUM_FILES: Readonly<Record<string, string>> = {
  "calendar.umd.js": "text/javascript; charset=utf-8",
  "calendar.css": "text/css; charset=utf-8",
  // One theme is required; its palette is bridged to FinPal tokens.
  "svalbard-light.css": "text/css; charset=utf-8",
  "fontawesome/css/fontawesome.css": "text/css; charset=utf-8",
  "fontawesome/css/solid.css": "text/css; charset=utf-8",
  "fontawesome/webfonts/fa-solid-900.woff2": "font/woff2",
  "fontawesome/webfonts/fa-solid-900.ttf": "font/ttf",
};

export const bryntumUrl = (file: string) =>
  `/vendor/bryntum/${BRYNTUM_VERSION}/${file}`;
