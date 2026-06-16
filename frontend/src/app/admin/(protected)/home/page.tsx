import { requireAdmin } from "@/lib/admin/auth";
import { getAdminSupabase } from "@/lib/supabase-admin";
import { HOME_KEYS, HOME_DEFAULTS } from "@/lib/data/home";
import { SettingForm } from "./SettingForm";

export const metadata = { title: "首頁設定" };

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

  return (
    <div className="mx-auto max-w-[920px]">
      <h1 className="text-ink text-[24px] font-bold">首頁設定</h1>
      <p className="text-text-muted mt-1 text-[15px]">
        編輯首頁各區段內容。每個區段以 JSON
        編輯（支援巢狀結構），儲存後即更新公開首頁。尚未建立的區段會以預設內容預填。
      </p>

      <div className="mt-6 flex flex-col gap-5">
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
    </div>
  );
}
