// FinPal logo, reference "2b · Reference, in the site palette" from
// docs/FinPal Logo.dc.html: a navy fold behind a periwinkle panel carrying a
// rising check-line. The panel and line are cut out of whatever sits behind
// the mark (--logo-knockout), exactly as in the reference.

const MARK_PATHS = (
  <>
    <path
      d="M6 22C6 18 8 16 11 14.5L30 5C32 4 34 4 36 5L42 8L18 20V58L10 53.5C7.5 52 6 50 6 47Z"
      fill="url(#fp-logo-fold)"
    />
    <path
      d="M21 26L48 12.5C53 10 58 13 58 19V33C58 38 55.5 41 51 43.2L29 54L21 59.5Z"
      fill="url(#fp-logo-panel)"
      stroke="var(--logo-knockout, var(--bg))"
      strokeWidth="4"
      strokeLinejoin="round"
      paintOrder="stroke"
    />
    <polyline
      points="27,38.5 33,34.5 37,38 47.5,27.5"
      fill="none"
      stroke="var(--logo-knockout, var(--bg))"
      strokeWidth="3.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </>
);

/** Gradients the mark refers to. Render once, in the root layout. */
export function LogoDefs() {
  return (
    // Not display:none: browsers drop gradients defined inside a hidden SVG,
    // which would leave the mark unpainted. Zero-size and out of flow instead.
    <svg
      width="0"
      height="0"
      className="svg-defs"
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id="fp-logo-fold" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#3E5A92" />
          <stop offset="1" stopColor="#1E2B4A" />
        </linearGradient>
        <linearGradient id="fp-logo-panel" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#7FA6F0" />
          <stop offset="1" stopColor="#CFE0FF" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <svg
      className="logo-mark"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden
    >
      {MARK_PATHS}
    </svg>
  );
}

/** Mark plus the two-tone "FinPal" wordmark. */
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <span className="logo">
      <LogoMark size={size} />
      <span className="logo-word">
        <span>Fin</span>
        <span className="logo-word__pal">Pal</span>
      </span>
    </span>
  );
}
