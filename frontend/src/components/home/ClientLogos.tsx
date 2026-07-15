import { HOME_CLIENTS } from "@/components/home/content";
import { Reveal } from "@/components/home/scrollAnimate";

// Clients — 指標性客戶 logo 牆（僅顯示 logo，不顯示公司名；有股票代號者於下方加一行）。
// 位置：最新消息 ↔ 與我們保持聯繫 之間。捲入視窗時標題與各 logo 依序淡入上移。
//
// 以原生 <img> 渲染：logo 含 SVG，next/image 未開 dangerouslyAllowSVG 會 400
// （與 Header 的品牌 LOGO 相同做法）。查無官方 logo 檔者以向量字標 / 公司名文字呈現。
export function ClientLogos() {
  return (
    <section className="border-border bg-surface-muted border-b">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-8 px-6 py-16 md:px-20 md:py-[72px]">
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
                <div className="border-border bg-surface hover:border-primary flex h-[104px] w-full items-center justify-center rounded-2xl border p-4 transition-all hover:shadow-[0_10px_26px_rgba(22,32,26,0.08)]">
                  {client.logo ? (
                    // logo；若有 caption（只有圖標的 logo），圖標縮小並在下方補文字。
                    <span className="flex flex-col items-center gap-1.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={client.logo}
                        alt={client.name}
                        className={`max-w-full object-contain ${
                          client.caption ? "max-h-9" : "max-h-14"
                        }`}
                      />
                      {client.caption ? (
                        <span className="text-ink text-[14px] leading-none font-bold">
                          {client.caption}
                        </span>
                      ) : null}
                    </span>
                  ) : client.wordmark ? (
                    // 查無官方 logo 檔者，以向量字標呈現（任何尺寸都銳利）。
                    <span className="flex flex-col items-center gap-0.5 text-center">
                      <span className="text-[26px] leading-none font-extrabold tracking-tight text-[#00A03C]">
                        {client.wordmark.text}
                      </span>
                      {client.wordmark.sub ? (
                        <span className="text-ink text-[8.5px] leading-tight font-semibold tracking-tight">
                          {client.wordmark.sub}
                        </span>
                      ) : null}
                    </span>
                  ) : (
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
