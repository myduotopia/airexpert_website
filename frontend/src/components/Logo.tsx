type LogoProps = {
  /** Tailwind color class for the mark, e.g. `text-primary-deep`. */
  className?: string;
};

/**
 * AirExpert brand mark (vector traced from the official artwork, Pencil node
 * `o2OvdI`). The true brand color is blue `#1E4690` (see public/airexpert-mark.svg).
 * Here the path uses `currentColor` so callers tint it via a text-color token —
 * the V3.08 "Eco Green Light" theme tints it green (deep on light, soft on dark).
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
      viewBox="0 0 141 90"
      fill="currentColor"
      fillRule="evenodd"
      aria-hidden="true"
      className={className}
    >
      <path d="M19 6l2 5 6 19 11 43 4 10 1 1 23 0-7-19-12-47-4-10-1-2z m56 0l6 16 13 50 5 12 23 0-2-5-5-15-11-43-5-14-1-1z m-69 19l0 40 27 0-2-9-8-19-7-11-1-1z m45 0l7 20 8 15 4 5 19 0-2-9-6-15-6-11-4-5z m57 0l2 9 8 19 7 11 1 1 9 0 0-40z" />
    </svg>
  );
}
