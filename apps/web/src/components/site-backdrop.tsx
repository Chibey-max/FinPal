import { FluidSphere } from "./fluid-sphere";

/**
 * The liquid sphere behind every page, fixed and centred ("Centered orb":
 * radius .46, cx 0, cy -.02, intensity .85). It lives in the root layout so
 * it keeps running across navigations. Pages scroll over it; the veil keeps
 * text readable. The landing hero drives --backdrop-scale while scrolling.
 */
export function SiteBackdrop() {
  return (
    <div className="site-backdrop" aria-hidden="true">
      <div className="site-backdrop__orb">
        <FluidSphere radius={0.46} cx={0} cy={-0.02} intensity={0.85} />
      </div>
      <div className="site-backdrop__veil" />
    </div>
  );
}
