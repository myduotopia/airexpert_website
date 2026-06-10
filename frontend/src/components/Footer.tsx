// Launch (temporary) footer — copyright line only.
// The full footer (brand, link columns, legal) is preserved in git history /
// on main; this trimmed version is for the interim "content updating" site.
const COPYRIGHT = "© 2026 JIN HE & CHAO HE AIR COMPRESSOR CO., LTD.";

export function Footer() {
  return (
    <footer className="bg-surface-dark text-white">
      <div className="mx-auto max-w-[1440px] px-6 py-6 md:px-12">
        <p className="text-text-on-dark-muted font-mono text-[11px] tracking-[0.5px]">
          {COPYRIGHT}
        </p>
      </div>
    </footer>
  );
}
