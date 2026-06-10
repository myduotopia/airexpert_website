import { Facebook, MessageCircle } from "lucide-react";

type Company = {
  region: string;
  name: string;
  line: string;
  fb: string;
};

const COMPANIES: Company[] = [
  {
    region: "北區服務中心",
    name: "勁賀空壓科技",
    line: "https://page.line.me/189njhgy?openQrModal=true",
    fb: "https://www.facebook.com/kaitain0120/",
  },
  {
    region: "南區服務中心",
    name: "超賀空壓科技",
    line: "https://page.line.me/427hiucm?openQrModal=true",
    fb: "https://www.facebook.com/people/%E8%B6%85%E8%B3%80%E7%A9%BA%E5%A3%93%E7%A7%91%E6%8A%80%E6%9C%89%E9%99%90%E5%85%AC%E5%8F%B8/100079963752126/",
  },
];

export function SocialFollow() {
  return (
    <section className="bg-surface border-border border-t">
      <div className="mx-auto max-w-[1440px] px-6 py-20 md:px-12 md:py-24">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-primary-deep font-mono text-[14px] tracking-[1px] uppercase">
            FOLLOW US · 追蹤我們
          </p>
          <h2 className="text-ink text-[30px] font-bold sm:text-[38px]">
            與我們保持聯繫
          </h2>
          <p className="text-text-muted max-w-[560px] text-[17px] leading-[1.6]">
            關注勁賀・超賀空壓官方帳號，掌握最新消息，或透過 LINE
            與專人即時諮詢。
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-2">
          {COMPANIES.map((c) => (
            <div
              key={c.name}
              className="border-border bg-surface flex flex-col gap-5 rounded-2xl border p-7"
            >
              <div className="flex flex-col gap-1">
                <p className="text-text-muted font-mono text-[13px] tracking-[0.5px]">
                  {c.region}
                </p>
                <h3 className="text-ink text-[20px] font-semibold">{c.name}</h3>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <a
                  href={c.line}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${c.name} LINE 官方帳號`}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#06C755] px-5 py-3 text-[16px] font-semibold text-white transition-opacity hover:opacity-90"
                >
                  <MessageCircle className="h-5 w-5" aria-hidden="true" />
                  LINE 官方帳號
                </a>
                <a
                  href={c.fb}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${c.name} Facebook 粉絲專頁`}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#1877F2] px-5 py-3 text-[16px] font-semibold text-white transition-opacity hover:opacity-90"
                >
                  <Facebook className="h-5 w-5" aria-hidden="true" />
                  粉絲專頁
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
