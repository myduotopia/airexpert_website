// Inline SVG icons for the products pages.
//
// The layout shell (Header/Footer) deliberately uses inline SVGs instead of
// pulling in `lucide-react` for a few decorative glyphs (see Footer.tsx). We
// stay consistent here: these are the lucide icon paths the product detail
// spec calls for, kept inline so no new runtime dependency is added.
//
// All icons inherit `currentColor` (set the colour via a Tailwind text token on
// the parent or via `className`) and are marked decorative (`aria-hidden`).

import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({
  size = 21,
  children,
  ...props
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

/** lucide `arrow-right` */
export function ArrowRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 12h14M12 5l7 7-7 7" />
    </Icon>
  );
}

/** lucide `download` */
export function DownloadIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </Icon>
  );
}

/** lucide `check` */
export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 6 9 17l-5-5" />
    </Icon>
  );
}

/** lucide `zap` */
export function ZapIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 14h7l-1 8 9-12h-7l1-8-9 12Z" />
    </Icon>
  );
}

/** lucide `shield-check` */
export function ShieldCheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1Z" />
      <path d="m9 12 2 2 4-4" />
    </Icon>
  );
}

/** lucide `activity` */
export function ActivityIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" />
    </Icon>
  );
}

/** lucide `thermometer` */
export function ThermometerIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z" />
    </Icon>
  );
}

/** lucide `volume-x` */
export function VolumeXIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298Z" />
      <path d="m16 9 6 6M22 9l-6 6" />
    </Icon>
  );
}

/** lucide `image` — placeholder glyph for empty media blocks */
export function ImagePlaceholderIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </Icon>
  );
}
