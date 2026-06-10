import { HOME_COLORS } from "@/components/home/tokens";

// Section 4 — Partners (bg surface-muted). Text wordmarks, not real logos.
const PARTNERS = ["TSMC", "UMC", "ASE", "Delta", "FoxConn", "Merida"];

export function Partners() {
  return (
    <section className="bg-surface-muted">
      <div className="mx-auto flex max-w-[1440px] flex-col items-center gap-6 px-6 py-12 text-center md:px-20">
        <p className="text-text-muted font-mono text-[14px] tracking-[1px]">
          台灣 800+ 製造廠信賴 · TRUSTED ACROSS TAIWAN
        </p>
        <ul className="flex flex-wrap items-center justify-center gap-x-14 gap-y-6">
          {PARTNERS.map((name) => (
            <li
              key={name}
              className="text-[24px] font-bold"
              style={{ color: HOME_COLORS.logoMuted }}
            >
              {name}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
