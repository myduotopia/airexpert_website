// 首頁內容資料存取 — SERVER ONLY。
// 首頁各區段文案存於 site_settings（key→jsonb，公開讀只看 is_public=true）。
// 本檔集中定義各 key 的 value 形狀、預設值（DB 尚未 seed 時的 fallback）與一個
// 聚合 loader（getHomeContent），讓 page.tsx 一次取得整頁內容並型別安全。
import "server-only";

import { getSiteSetting } from "./site";

// ---------- value 形狀 ----------
export interface CtaLink {
  label: string;
  href: string;
}

export interface HomeHero {
  eyebrow: string;
  title: string;
  subtitle: string;
  cta_primary: CtaLink;
  cta_secondary: CtaLink;
}

export interface HomeStat {
  value: string;
  label: string;
}

export interface HomeStats {
  items: HomeStat[];
}

export interface HomePartners {
  label: string;
  logos: string[];
}

export interface OverviewProduct {
  /** lucide 圖示名稱（對應 ICON_MAP），未對應時退回預設圖示。 */
  icon: string;
  title: string;
  description: string;
}

export interface AirSenseStat {
  value: string;
  label: string;
}

export interface HomeOverview {
  eyebrow: string;
  title: string;
  products: OverviewProduct[];
  airsense: {
    badge: string;
    title: string;
    description: string;
    stats: AirSenseStat[];
  };
}

export interface TechFeature {
  icon: string;
  title: string;
  description: string;
}

export interface HomeTech {
  eyebrow: string;
  title: string;
  description: string;
  features: TechFeature[];
}

export interface HomeNews {
  eyebrow: string;
  title: string;
}

export interface HomeCta {
  title: string;
  subtitle: string;
  cta: CtaLink;
}

export interface HomeContent {
  hero: HomeHero;
  stats: HomeStats;
  partners: HomePartners;
  overview: HomeOverview;
  tech: HomeTech;
  news: HomeNews;
  cta: HomeCta;
}

// ---------- site_settings key 常數 ----------
export const HOME_KEYS = {
  hero: "home_hero",
  stats: "home_stats",
  partners: "home_partners",
  overview: "home_overview",
  tech: "home_tech",
  news: "home_news",
  cta: "home_cta",
} as const;

// ---------- 預設值（DB 未 seed 時的 fallback；與 supabase/seeds/home.sql 一致） ----------
export const HOME_DEFAULTS: HomeContent = {
  hero: {
    eyebrow: "創立於 1997 · 台灣製造",
    title: "節能氣源，邁向淨零的製造未來",
    subtitle:
      "無油空壓、真空與乾燥系統結合智慧能源管理，協助台灣製造業降低能耗、減少碳排，落實 ESG 永續承諾。",
    cta_primary: { label: "探索產品系列", href: "/products" },
    cta_secondary: { label: "預約專人談話", href: "/contact" },
  },
  stats: {
    items: [
      { value: "1997", label: "成立年份 · 台灣製造" },
      { value: "800+", label: "信賴製造廠" },
      { value: "35%", label: "平均節能效益" },
      { value: "12k", label: "年減碳 tCO₂e" },
    ],
  },
  partners: {
    label: "台灣 800+ 製造廠信賴 · TRUSTED ACROSS TAIWAN",
    logos: ["TSMC", "UMC", "ASE", "Delta", "FoxConn", "Merida"],
  },
  overview: {
    eyebrow: "PRODUCT SYSTEMS · 產品系列",
    title: "完整節能氣源系統，單一窗口整合",
    products: [
      {
        icon: "wind",
        title: "空氣壓縮機",
        description: "無油與噴油螺旋、離心式機種，7.5–250 kW。",
      },
      {
        icon: "gauge",
        title: "真空泵浦",
        description: "乾式與水環式真空系統，穩定深真空表現。",
      },
      {
        icon: "fan",
        title: "鼓風機",
        description: "三葉羅茨與渦輪式，污水與氣力輸送應用。",
      },
      {
        icon: "droplets",
        title: "乾燥機",
        description: "冷凍式與吸附式乾燥，達 ISO 8573 露點。",
      },
    ],
    airsense: {
      badge: "AIRSENSE CLOUD",
      title: "智慧監控雲端平台",
      description:
        "即時監測壓力、流量與耗能，結合 ISO 50001 能源管理框架，量化每一度節能成效。",
      stats: [
        { value: "−35%", label: "能耗" },
        { value: "24/7", label: "遠端監控" },
        { value: "−60%", label: "停機" },
      ],
    },
  },
  tech: {
    eyebrow: "SUSTAINABILITY · 永續節能",
    title: "以數據實踐淨零承諾",
    description:
      "從用氣基線量測到持續優化，導入 ISO 50001 能源管理系統，讓每一度電與每一公斤碳排都被看見、被改善。",
    features: [
      {
        icon: "ruler",
        title: "用氣基線量測",
        description: "盤點全廠用氣量與耗能，建立可比較的減碳基準。",
      },
      {
        icon: "badge-check",
        title: "ISO 50001 導入",
        description: "依國際能源管理框架建置制度與績效指標。",
      },
      {
        icon: "line-chart",
        title: "持續優化追蹤",
        description: "雲端數據持續監測，量化每一階段節能成效。",
      },
    ],
  },
  news: {
    eyebrow: "NEWS · 最新消息",
    title: "永續動態與技術觀點",
  },
  cta: {
    title: "準備好讓氣源系統更節能了嗎？",
    subtitle:
      "預約能源診斷，我們將協助評估節能與減碳潛力，量身規劃最合適的氣源配置。",
    cta: { label: "預約能源診斷", href: "/contact" },
  },
};

// 取單一 key，找不到（或尚未 seed）時退回 default。
async function settingOr<T>(key: string, fallback: T): Promise<T> {
  const value = await getSiteSetting<T>(key);
  return value ?? fallback;
}

/**
 * 一次取得整頁首頁內容。各 key 獨立讀取、可獨立 fallback，
 * 任一 key 缺漏不影響其他區段。回傳值供 page.tsx 直接 render。
 */
export async function getHomeContent(): Promise<HomeContent> {
  const [hero, stats, partners, overview, tech, news, cta] = await Promise.all([
    settingOr(HOME_KEYS.hero, HOME_DEFAULTS.hero),
    settingOr(HOME_KEYS.stats, HOME_DEFAULTS.stats),
    settingOr(HOME_KEYS.partners, HOME_DEFAULTS.partners),
    settingOr(HOME_KEYS.overview, HOME_DEFAULTS.overview),
    settingOr(HOME_KEYS.tech, HOME_DEFAULTS.tech),
    settingOr(HOME_KEYS.news, HOME_DEFAULTS.news),
    settingOr(HOME_KEYS.cta, HOME_DEFAULTS.cta),
  ]);

  return { hero, stats, partners, overview, tech, news, cta };
}
