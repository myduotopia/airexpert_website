import { requireAdmin } from "@/lib/admin/auth";
import { getAdminSupabase } from "@/lib/supabase-admin";
import { HOME_KEYS, HOME_DEFAULTS } from "@/lib/data/home";
import { getBranding } from "@/lib/data/site";
import { SettingForm } from "./SettingForm";
import { BrandingForm } from "./BrandingForm";

export const metadata = { title: "首頁與品牌設定" };

// 各 key 的中文標題 / 說明，與編輯的 HOME_DEFAULTS slice。
const SECTIONS: {
  key: string;
  label: string;
  description: string;
  fallback: unknown;
}[] = [
  {
    key: HOME_KEYS.hero,
    label: "主視覺 Hero",
    description: "上標、主標、副標與兩顆 CTA（label / href）。",
    fallback: HOME_DEFAULTS.hero,
  },
  {
    key: HOME_KEYS.stats,
    label: "數據列 Stats",
    description: "items 為四組 { value, label } 數據。",
    fallback: HOME_DEFAULTS.stats,
  },
  {
    key: HOME_KEYS.partners,
    label: "信賴客戶 Partners",
    description: "label 說明文字與 logos 文字列表。",
    fallback: HOME_DEFAULTS.partners,
  },
  {
    key: HOME_KEYS.overview,
    label: "產品系列 Overview",
    description:
      "eyebrow / title、products（icon 名稱可用 wind / gauge / fan / droplets）、airsense 區塊。",
    fallback: HOME_DEFAULTS.overview,
  },
  {
    key: HOME_KEYS.tech,
    label: "永續節能 Tech",
    description:
      "eyebrow / title / description 與 features（icon 名稱可用 ruler / badge-check / line-chart）。",
    fallback: HOME_DEFAULTS.tech,
  },
  {
    key: HOME_KEYS.news,
    label: "最新消息標題 News",
    description: "僅區塊 eyebrow / title；卡片自動取自已發佈的最新消息。",
    fallback: HOME_DEFAULTS.news,
  },
  {
    key: HOME_KEYS.cta,
    label: "行動呼籲 CTA",
    description: "title / subtitle 與 cta（label / href）。",
    fallback: HOME_DEFAULTS.cta,
  },
];

export default async function AdminHomePage() {
  await requireAdmin();

  // service_role 讀取（繞過 RLS），含尚未公開或尚未建立的 key。
  const { data } = await getAdminSupabase()
    .from("site_settings")
    .select("key, value")
    .in(
      "key",
      SECTIONS.map((s) => s.key),
    );

  const current = new Map<string, unknown>(
    (data ?? []).map((row) => [row.key as string, row.value as unknown]),
  );

  const branding = await getBranding();

  return (
    <div className="mx-auto max-w-[920px]">
      <h1 className="text-ink text-[24px] font-bold">首頁與品牌設定</h1>
      <p className="text-text-muted mt-1 text-[15px]">
        設定全站品牌資產（LOGO / favicon）與首頁各區段內容。
      </p>

      {/* 品牌資產 — 全站即時生效（不受首頁版面影響） */}
      <section className="mt-8">
        <div className="flex items-baseline gap-2">
          <h2 className="text-ink text-[18px] font-bold">品牌資產</h2>
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-800">
            全站即時生效
          </span>
        </div>
        <p className="text-text-muted mt-1 text-[14px]">
          LOGO 套用於前台頁首、favicon 套用於瀏覽器分頁。留空則使用內建預設素材。
        </p>
        <div className="mt-4">
          <BrandingForm
            logoUrl={branding.logo_url}
            faviconUrl={branding.favicon_url}
          />
        </div>
      </section>

      {/* 首頁區段內容 — 目前首頁採過渡版面，這些區段暫未顯示於前台 */}
      <section className="mt-12">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-ink text-[18px] font-bold">首頁區段內容</h2>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
            目前未顯示於前台
          </span>
        </div>
        <div className="border-border bg-surface-muted mt-3 rounded-lg border p-4 text-[13px] leading-relaxed text-text-muted">
          <p className="text-ink font-medium">關於目前的首頁版面</p>
          <p className="mt-1">
            前台首頁目前採用「過渡版面」（痛點輪播 → 產品展示 →
            產品特色 → 社群追蹤），<strong>不會</strong>讀取以下區段設定。
            這些區段（Hero / Stats /
            產品系列…）屬於完整 V3.08 首頁，待正式版面切換後才會生效。
            你仍可在此預先編輯內容；儲存的內容會保留，切換版面後即套用。
          </p>
        </div>

        <div className="mt-5 flex flex-col gap-5">
          {SECTIONS.map((section) => {
            const value = current.has(section.key)
              ? current.get(section.key)
              : section.fallback;
            return (
              <SettingForm
                key={section.key}
                settingKey={section.key}
                label={section.label}
                description={section.description}
                initialJson={JSON.stringify(value, null, 2)}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}
