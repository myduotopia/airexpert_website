import { requireAdmin } from "@/lib/admin/auth";
import { getAdminSupabase } from "@/lib/supabase-admin";
import { HOME_KEYS, HOME_DEFAULTS, type HomeContent } from "@/lib/data/home";
import {
  HOME_CASE_DEFAULT_COLLECTION,
  type HomeCaseCollection,
} from "@/components/home/content";
import { getBranding } from "@/lib/data/site";
import { BrandingForm } from "./BrandingForm";
import {
  CarouselForm,
  StatsForm,
  CaseStudyForm,
  TechForm,
  NewsForm,
  ProductsForm,
  FeaturesForm,
  SocialForm,
} from "./sections/SectionForms";

export const metadata = { title: "首頁與品牌設定" };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * 以預設值為骨架淺層套用 DB 值。各區段表單以 optional chaining 讀欄位、
 * 缺漏自然退回欄位預設，故此處只需在「整段不是物件」時退回整段預設，
 * 避免把壞形狀（純量 / null）傳進 client 表單。
 */
function prefill<T extends object>(value: unknown, fallback: T): T {
  if (!isPlainObject(value)) return fallback;
  return { ...fallback, ...value } as T;
}

export default async function AdminHomePage() {
  await requireAdmin();

  // service_role 讀取（繞過 RLS），含尚未公開或尚未建立的 key。
  const keys = Object.values(HOME_KEYS);
  const { data } = await getAdminSupabase()
    .from("site_settings")
    .select("key, value")
    .in("key", keys);

  const current = new Map<string, unknown>(
    (data ?? []).map((row) => [row.key as string, row.value as unknown]),
  );

  const home: HomeContent = {
    carousel: prefill(current.get(HOME_KEYS.carousel), HOME_DEFAULTS.carousel),
    stats: prefill(current.get(HOME_KEYS.stats), HOME_DEFAULTS.stats),
    // caseStudy 於前台是「已 resolve 的單筆」，後台則需編輯整個 collection（見下方 caseCollection）。
    caseStudy: HOME_DEFAULTS.caseStudy,
    tech: prefill(current.get(HOME_KEYS.tech), HOME_DEFAULTS.tech),
    news: prefill(current.get(HOME_KEYS.news), HOME_DEFAULTS.news),
    products: prefill(current.get(HOME_KEYS.products), HOME_DEFAULTS.products),
    features: prefill(current.get(HOME_KEYS.features), HOME_DEFAULTS.features),
    social: prefill(current.get(HOME_KEYS.social), HOME_DEFAULTS.social),
  };

  // 客戶實績以 collection 形狀（多個案 + selectedIndex）編輯，故獨立 prefill。
  const caseCollection: HomeCaseCollection = prefill(
    current.get(HOME_KEYS.caseStudy),
    HOME_CASE_DEFAULT_COLLECTION,
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
          LOGO 套用於前台頁首、favicon
          套用於瀏覽器分頁。留空則使用內建預設素材。
        </p>
        <div className="mt-4">
          <BrandingForm
            logoUrl={branding.logo_url}
            faviconUrl={branding.favicon_url}
          />
        </div>
      </section>

      {/* 首頁區段內容 — 依前台顯示順序逐欄編輯 */}
      <section className="mt-12">
        <h2 className="text-ink text-[18px] font-bold">首頁區段內容</h2>
        <p className="text-text-muted mt-1 text-[14px]">
          以下區段依前台首頁實際顯示順序排列；每個區段儲存後即更新前台對應內容。
        </p>

        <div className="mt-5 flex flex-col gap-5">
          <CarouselForm value={home.carousel} />
          <StatsForm value={home.stats} />
          <CaseStudyForm value={caseCollection} />
          <TechForm value={home.tech} />
          <NewsForm value={home.news} />
          <ProductsForm value={home.products} />
          <FeaturesForm value={home.features} />
          <SocialForm value={home.social} />
        </div>
      </section>
    </div>
  );
}
