/**
 * iPhone / iPad (incl. iPadOS desktop UA). Used to gate landing scroll
 * performance — desktop and non-iOS stay on the full-motion path.
 */
export function isIosDevice() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ reports as MacIntel with touch.
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}
