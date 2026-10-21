import { Dimensions, PixelRatio } from "react-native";

// Screen-size scaling in the spirit of Flutter's screenutil. Sizes in the
// code are written for a 375pt-wide phone (the design width) and scaled to
// the device.
const DESIGN_WIDTH = 375;
// Keeps tablets and the browser preview from blowing every size up, and
// very narrow phones from shrinking text below legibility.
const MIN_SCALE = 0.85;
const MAX_SCALE = 1.3;

/** Width of the window, capped to the phone column the web preview uses. */
function windowWidth() {
  return Math.min(Dimensions.get("window").width, 430);
}

function factor() {
  const raw = windowWidth() / DESIGN_WIDTH;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, raw));
}

const snap = (value: number) => PixelRatio.roundToNearestPixel(value);

/** Scales a size (padding, gap, radius, width) proportionally to screen width. */
export const s = (size: number) => snap(size * factor());

/**
 * Scales a font size by half as much as `s`, so text grows with the screen
 * without becoming oversized on large phones. Pass `weight` (0-1) to change
 * how much of the scale is applied.
 */
export const ms = (size: number, weight = 0.5) =>
  snap(size + (size * factor() - size) * weight);
