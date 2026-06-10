type ContactLine = { label: string; value: string; href?: string };
type Office = { name: string; lines: ContactLine[] };

const OFFICES: Office[] = [
  {
    name: "北區服務中心 · 勁賀空壓科技有限公司",
    lines: [
      { label: "免付費", value: "0800-88-4588", href: "tel:0800884588" },
      { label: "電話", value: "02-2675-9977", href: "tel:0226759977" },
      { label: "傳真", value: "02-2675-9955" },
      {
        label: "信箱",
        value: "Service@airexpert.com.tw",
        href: "mailto:Service@airexpert.com.tw",
      },
      { label: "地址", value: "新北市樹林區備內街 136 號 1 樓" },
    ],
  },
  {
    name: "南區服務中心 · 超賀空壓科技有限公司",
    lines: [
      { label: "免付費", value: "0800-88-4588", href: "tel:0800884588" },
      { label: "電話", value: "07-699-8686", href: "tel:076998686" },
      { label: "傳真", value: "07-699-2020" },
      {
        label: "信箱",
        value: "support8686@airexpert.com.tw",
        href: "mailto:support8686@airexpert.com.tw",
      },
      { label: "地址", value: "高雄市湖內區中山路二段 256 號" },
    ],
  },
  {
    name: "全台營業處 · 銓賀空壓能源有限公司",
    lines: [
      { label: "電話", value: "02-2675-2277", href: "tel:0226752277" },
      { label: "傳真", value: "02-2675-2177" },
      { label: "地址", value: "新北市樹林區大安路 592 號" },
    ],
  },
];

const COPYRIGHT = "© 2026 JIN HE & CHAO HE AIR COMPRESSOR CO., LTD.";

export function Footer() {
  return (
    <footer className="bg-surface-dark text-white">
      {/* 聯絡我們 */}
      <div className="mx-auto max-w-[1440px] px-6 pt-14 pb-10 md:px-12">
        <h2 className="text-[20px] font-bold text-white">聯絡我們</h2>
        <div className="mt-8 grid grid-cols-1 gap-10 md:grid-cols-3">
          {OFFICES.map((office) => (
            <div key={office.name}>
              <h3 className="text-primary-soft text-[16px] font-semibold">
                {office.name}
              </h3>
              <dl className="mt-4 flex flex-col gap-2.5">
                {office.lines.map((l) => (
                  <div key={l.label} className="flex gap-3 text-[15px]">
                    <dt className="text-text-on-dark-muted w-12 shrink-0">
                      {l.label}
                    </dt>
                    <dd className="text-white/90">
                      {l.href ? (
                        <a
                          href={l.href}
                          className="hover:text-primary-soft transition-colors"
                        >
                          {l.value}
                        </a>
                      ) : (
                        l.value
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-border-dark border-t">
        <div className="mx-auto max-w-[1440px] px-6 py-5 md:px-12">
          <p className="text-text-on-dark-muted font-mono text-[13px] tracking-[0.5px]">
            {COPYRIGHT}
          </p>
        </div>
      </div>
    </footer>
  );
}
