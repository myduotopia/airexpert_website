import { HOME_CLIENTS } from "@/components/home/content";
import { Reveal } from "@/components/home/scrollAnimate";

// Clients — 指標性客戶 logo 牆（僅顯示 logo，不顯示公司名/代號）。
// 位置：最新消息 ↔ 與我們保持聯繫 之間。捲入視窗時標題與各 logo 依序淡入上移。
//
// variant：
//   gray  — logo 灰階，滑過恢復彩色（低調專業）
//   color — 直接彩色
// previewLabel：僅供 preview 期間標示 A / B 版本，正式上線移除。
//
// 以原生 <img> 渲染：logo 含 SVG，next/image 未開 dangerouslyAllowSVG 會 400
// （與 Header 的品牌 LOGO 相同做法）。
export function ClientLogos({
  variant = "gray",
  previewLabel,
}: {
  variant?: "gray" | "color";
  previewLabel?: string;
}) {
  const gray = variant === "gray";
  return (
    <section className="border-border bg-surface-muted border-b">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-8 px-6 py-16 md:px-20 md:py-[72px]">
        {previewLabel ? (
          <span className="bg-primary/10 text-primary-deep w-fit rounded-full px-3 py-1 text-[12px] font-semibold">
            {previewLabel}
          </span>
        ) : null}

        <Reveal className="flex flex-col gap-2.5">
          <p className="text-primary-deep font-mono text-[12px] tracking-[1px] uppercase">
            CLIENTS · 指標性客戶
          </p>
          <h2 className="text-ink text-[26px] font-bold sm:text-[32px]">
            深受標竿企業信賴
          </h2>
          <p className="text-text-muted max-w-[640px] text-[15px] leading-[1.6]">
            從半導體設備、精密傳動到鋼鐵與衛浴製造，領導廠商選擇勁賀的節能氣源方案。
          </p>
        </Reveal>

        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7">
          {HOME_CLIENTS.map((client, i) => (
            <Reveal key={client.name} delay={i * 50}>
              <div className="flex flex-col items-center gap-2">
                <div className="group border-border bg-surface hover:border-primary flex h-[104px] w-full items-center justify-center rounded-2xl border p-4 transition-all hover:shadow-[0_10px_26px_rgba(22,32,26,0.08)]">
                  {client.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={client.logo}
                      alt={client.name}
                      className={`max-h-14 max-w-full object-contain ${
                        gray
                          ? "opacity-70 grayscale transition duration-300 group-hover:opacity-100 group-hover:grayscale-0"
                          : ""
                      }`}
                    />
                  ) : (
                    // 查無官方 logo 檔者，以公司名文字呈現。
                    <span className="text-ink text-center text-[15px] leading-tight font-bold">
                      {client.name}
                    </span>
                  )}
                </div>
                {client.code ? (
                  <span className="text-text-muted text-center text-[11.5px] leading-tight">
                    上市公司股票代號：{client.code}
                  </span>
                ) : null}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
