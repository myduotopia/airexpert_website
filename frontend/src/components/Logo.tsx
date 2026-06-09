type LogoProps = {
  /** Tailwind color class for the mark fill, e.g. `text-primary-deep`. */
  className?: string;
};

/**
 * Brand logo mark (40×26 in the design).
 *
 * TODO: swap this placeholder for the real "AirExpert Mark" SVG artwork
 * (Pencil node `o2OvdI`) once it is provided by the client. For now we render
 * a tasteful rounded-square placeholder using `currentColor` so callers can
 * tint it via a text-color token (green-deep on light, green-soft on dark).
 *
 * Decorative: in every current usage the mark sits beside the visible brand
 * wordmark, so it is `aria-hidden` to avoid the screen reader announcing the
 * brand name twice. If used standalone later, give it a label at the call site.
 */
export function Logo({ className }: LogoProps) {
  return (
    <svg
      width="40"
      height="26"
      viewBox="0 0 40 26"
      aria-hidden="true"
      className={className}
    >
      <rect width="40" height="26" rx="7" fill="currentColor" />
      <text
        x="20"
        y="18"
        textAnchor="middle"
        fontFamily="var(--font-mono)"
        fontSize="12"
        fontWeight="700"
        fill="#ffffff"
      >
        AE
      </text>
    </svg>
  );
}
