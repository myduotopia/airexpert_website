// 首頁內容資料存取 — SERVER ONLY。
// 首頁各區段文案存於 site_settings（key→jsonb，公開讀只看 is_public=true）。
// 本檔集中定義各 key 的 value 形狀、預設值（DB 尚未 seed 時的 fallback）與一個
// 聚合 loader（getHomeContent），讓 page.tsx 一次取得整頁內容並型別安全。
//
// 首頁（改版後）共 7 個區段，依序：
//   輪播圖(carousel) → 數據列(stats) → 永續節能(tech) → 最新消息(news)
//   → 產品系列(products) → 產品特色(features) → 追蹤我們(social)
import "server-only";

import { getSiteSetting } from "./site";
import { HOME_KEYS } from "./home-keys";

// ---------- value 形狀 ----------

/** 輪播圖單張。痛點編號由前台依索引自動產生，不存於資料。 */
export interface HomeCarouselSlide {
  image_url: string;
  alt: string;
  category: string;
  headline: string;
  tagline: string;
}

export interface HomeCarousel {
  slides: HomeCarouselSlide[];
}

export interface HomeStat {
  value: string;
  label: string;
}

export interface HomeStats {
  items: HomeStat[];
}

export interface TechFeature {
  /** lucide 圖示名稱（對應 resolveIcon），未對應時退回預設圖示。 */
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

export interface HomeProductCategory {
  image_url: string;
  name: string;
  desc: string;
}

export interface HomeProducts {
  eyebrow: string;
  title: string;
  description: string;
  categories: HomeProductCategory[];
}

export interface HomeFeature {
  /** lucide 圖示名稱（對應 ProductFeatures 的 ICON_MAP），未對應時退回預設圖示。 */
  icon: string;
  title: string;
  desc: string;
}

export interface HomeFeatures {
  eyebrow: string;
  title: string;
  features: HomeFeature[];
}

export interface HomeSocialCompany {
  region: string;
  name: string;
  line: string;
  fb: string;
}

export interface HomeSocial {
  eyebrow: string;
  title: string;
  description: string;
  companies: HomeSocialCompany[];
}

export interface HomeContent {
  carousel: HomeCarousel;
  stats: HomeStats;
  tech: HomeTech;
  news: HomeNews;
  products: HomeProducts;
  features: HomeFeatures;
  social: HomeSocial;
}

// ---------- site_settings key 常數 ----------
// 改版後前台首頁實際 render 的 7 個區段，皆可於後台逐欄編輯。
// HOME_KEYS 定義移至 client-safe 的 ./home-keys（避免 client 表單連帶載入本檔的
// "server-only"）；此處 import 供本檔內部使用、並 re-export 維持既有
// `from "@/lib/data/home"` 匯入相容。
export { HOME_KEYS };

// ---------- 預設值（DB 未 seed 時的 fallback；與目前硬編內容一致，確保視覺不變） ----------
export const HOME_DEFAULTS: HomeContent = {
  carousel: {
    slides: [
      {
        image_url: "/hero/pain-01-cost.png",
        alt: "壓縮機房中能源被漩渦吸走，象徵電費成本",
        category: "電費過高",
        headline: "空壓機最貴的不是買，是用",
        tagline: "設備不貴，電費才是成本黑洞",
      },
      {
        image_url: "/hero/pain-02-pressure.png",
        alt: "壓力錶指針劇烈擺動，產線亮起警示燈",
        category: "壓力不穩",
        headline: "氣壓忽高忽低，產線最怕這個",
        tagline: "壓力不穩，良率就在流失",
      },
      {
        image_url: "/hero/pain-03-downtime.png",
        alt: "工廠紅色警示燈亮起，機台停擺、員工等待",
        category: "故障停機",
        headline: "一停機，全廠都在等",
        tagline: "停機一分鐘，損失持續放大",
      },
      {
        image_url: "/hero/pain-04-repair.png",
        alt: "拆開維修中的空壓機，零件與工具散落",
        category: "維修頻繁",
        headline: "一直修，一直花錢",
        tagline: "維修不是成本，是無底洞",
      },
      {
        image_url: "/hero/pain-05-mismatch.png",
        alt: "雜亂的壓縮空氣管路多處漏氣",
        category: "系統不匹配",
        headline: "買了機器，卻不適合現場",
        tagline: "選錯規格，比沒買還貴",
      },
    ],
  },
  stats: {
    items: [
      { value: "1997", label: "成立年份 · 台灣製造" },
      { value: "800+", label: "信賴製造廠" },
      { value: "35%", label: "平均節能效益" },
      { value: "12k", label: "年減碳 tCO₂e" },
    ],
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
  products: {
    eyebrow: "PRODUCT SYSTEMS · 產品系列",
    title: "完整節能氣源系統",
    description:
      "從空壓、真空、鼓風到乾燥，單一窗口整合最適合廠務設備的節能配置。",
    categories: [
      {
        image_url: "/categories/cat-air-compressor.jpg",
        name: "變頻空壓機",
        desc: "永磁變頻螺旋、無油與微油機種，7.5–600 HP 完整涵蓋。",
      },
      {
        image_url: "/categories/cat-vacuum-pump.jpg",
        name: "變頻真空泵",
        desc: "乾式與微油變頻真空系統，穩定深真空表現。",
      },
      {
        image_url: "/categories/cat-blower.jpg",
        name: "變頻鼓風機",
        desc: "氣懸浮／磁懸浮離心式，污水與氣力輸送應用。",
      },
      {
        image_url: "/categories/cat-centrifugal.jpg",
        name: "離心式空壓機",
        desc: "大型離心機種，300–4500 kW 高流量需求。",
      },
      {
        image_url: "/categories/cat-refrigerated-dryer.jpg",
        name: "冷凍式乾燥機",
        desc: "相變儲能與冷凍式乾燥，穩定露點控制。",
      },
      {
        image_url: "/categories/cat-adsorption-dryer.jpg",
        name: "吸附式乾燥機",
        desc: "壓縮熱回收與雙塔吸附，達 −70°C 低露點。",
      },
    ],
  },
  features: {
    eyebrow: "KEY FEATURES · 產品特色",
    title: "為潔淨與節能而生",
    features: [
      {
        icon: "zap",
        title: "高效節能",
        desc: "永磁變頻隨需供氣，平均節能達 35%。",
      },
      {
        icon: "shield-check",
        title: "Class 0 無油",
        desc: "符合 ISO 8573-1 最高潔淨等級，零油氣污染。",
      },
      {
        icon: "activity",
        title: "智慧監控",
        desc: "感測聯網，遠端即時掌握壓力、流量與耗能。",
      },
      {
        icon: "thermometer",
        title: "穩定溫控",
        desc: "多級冷卻設計，確保長時間穩定輸出。",
      },
      {
        icon: "volume-x",
        title: "低噪音運轉",
        desc: "隔音機罩設計，運轉噪音低至 67 dB(A)。",
      },
      {
        icon: "leaf",
        title: "永續減碳",
        desc: "導入 ISO 50001 能源管理，落實淨零承諾。",
      },
    ],
  },
  social: {
    eyebrow: "FOLLOW US · 追蹤我們",
    title: "與我們保持聯繫",
    description:
      "關注勁賀・超賀空壓官方帳號，掌握最新消息，或透過 LINE 與專人即時諮詢。",
    companies: [
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
    ],
  },
};

// 取單一 key，找不到（或尚未 seed）時退回 default。
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * 以 fallback（型別預設值）為骨架，深層套用 DB 存的 value。
 * 後台可能存進壞形狀的 jsonb（語法正確但缺欄位 / 型別不符 / 純量）——
 * 此處讓型別不符的欄位退回預設、陣列僅在確實是陣列時採用，
 * 確保前台 server render 不會因此 crash（缺漏只影響該欄位、不影響整頁）。
 */
function mergeShape<T>(value: unknown, fallback: T): T {
  if (Array.isArray(fallback)) {
    return (Array.isArray(value) ? value : fallback) as T;
  }
  if (isPlainObject(fallback)) {
    if (!isPlainObject(value)) return fallback;
    const out: Record<string, unknown> = { ...fallback };
    for (const k of Object.keys(fallback)) {
      out[k] = mergeShape(value[k], (fallback as Record<string, unknown>)[k]);
    }
    return out as T;
  }
  return (typeof value === typeof fallback ? value : fallback) as T;
}

async function settingOr<T>(key: string, fallback: T): Promise<T> {
  const value = await getSiteSetting<T>(key);
  if (value == null) return fallback;
  return mergeShape(value, fallback);
}

/**
 * 一次取得整頁首頁內容。各 key 獨立讀取、可獨立 fallback，
 * 任一 key 缺漏不影響其他區段。回傳值供 page.tsx 直接 render。
 */
export async function getHomeContent(): Promise<HomeContent> {
  const [carousel, stats, tech, news, products, features, social] =
    await Promise.all([
      settingOr(HOME_KEYS.carousel, HOME_DEFAULTS.carousel),
      settingOr(HOME_KEYS.stats, HOME_DEFAULTS.stats),
      settingOr(HOME_KEYS.tech, HOME_DEFAULTS.tech),
      settingOr(HOME_KEYS.news, HOME_DEFAULTS.news),
      settingOr(HOME_KEYS.products, HOME_DEFAULTS.products),
      settingOr(HOME_KEYS.features, HOME_DEFAULTS.features),
      settingOr(HOME_KEYS.social, HOME_DEFAULTS.social),
    ]);

  return { carousel, stats, tech, news, products, features, social };
}
