// 聯絡資訊資料存取 — SERVER ONLY。
// 聯絡頁右側「南北兩處服務中心」的地址 / 電話 / Email 等存於 site_settings
// （key=contact_info，jsonb，公開讀只看 is_public=true）。
// 本檔集中定義 value 形狀、預設值（DB 尚未 seed 時的 fallback）與一個 loader，
// 讓 page.tsx 一次取得內容並型別安全。形狀與 supabase/seeds/contact.sql 一致。
import "server-only";

import { getSiteSetting } from "./site";

// ---------- value 形狀 ----------
/** 單一聯絡資料列（label 例如「電話」「Email」「地址」；href 可選，供 tel:/mailto: 連結）。 */
export interface ContactLine {
  label: string;
  value: string;
  href?: string | null;
}

/** 單一服務中心（北區 / 南區）。 */
export interface ContactCenter {
  name: string;
  lines: ContactLine[];
}

export interface ContactInfo {
  /** 表單上方的引導小標 / 主標 / 副標。 */
  eyebrow: string;
  title: string;
  subtitle: string;
  /** 右側服務中心卡片（依序顯示）。 */
  centers: ContactCenter[];
}

// ---------- site_settings key 常數 ----------
export const CONTACT_INFO_KEY = "contact_info";

// ---------- 預設值（DB 未 seed 時的 fallback；與 supabase/seeds/contact.sql 一致） ----------
export const CONTACT_INFO_DEFAULT: ContactInfo = {
  eyebrow: "聯絡我們 · CONTACT",
  title: "與超勁賀聯繫",
  subtitle:
    "南北兩處服務中心，提供空壓系統諮詢、現場評估與節能改善。歡迎來電或線上留言，我們將盡快與您聯繫。",
  centers: [
    {
      name: "北區服務中心 · 勁賀空壓科技",
      lines: [
        { label: "免付費", value: "0800-88-4588", href: "tel:0800884588" },
        { label: "電話", value: "02-2675-9977", href: "tel:0226759977" },
        {
          label: "Email",
          value: "Service@airexpert.com.tw",
          href: "mailto:Service@airexpert.com.tw",
        },
        { label: "地址", value: "新北市樹林區備內街 136 號 1 樓", href: null },
      ],
    },
    {
      name: "南區服務中心 · 超賀空壓科技",
      lines: [
        { label: "免付費", value: "0800-88-4588", href: "tel:0800884588" },
        { label: "電話", value: "07-699-8686", href: "tel:076998686" },
        {
          label: "Email",
          value: "support8686@airexpert.com.tw",
          href: "mailto:support8686@airexpert.com.tw",
        },
        { label: "地址", value: "高雄市湖內區中山路二段 256 號", href: null },
      ],
    },
  ],
};

// ---------- merge 工具（後台可能存進壞形狀的 jsonb；缺漏退回預設、不讓前台 crash） ----------
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isString(v: unknown): v is string {
  return typeof v === "string";
}

/** 將 DB 的 line 物件清洗為合法 ContactLine；不合法回 null。 */
function normalizeLine(value: unknown): ContactLine | null {
  if (!isPlainObject(value)) return null;
  if (!isString(value.label) || !isString(value.value)) return null;
  const href = isString(value.href) ? value.href : null;
  return { label: value.label, value: value.value, href };
}

/** 將 DB 的 center 物件清洗為合法 ContactCenter；不合法回 null。 */
function normalizeCenter(value: unknown): ContactCenter | null {
  if (!isPlainObject(value)) return null;
  if (!isString(value.name)) return null;
  const lines = Array.isArray(value.lines)
    ? value.lines.map(normalizeLine).filter((l): l is ContactLine => l !== null)
    : [];
  return { name: value.name, lines };
}

/**
 * 以 fallback 為骨架套用 DB value：字串欄位型別不符退回預設，
 * centers 僅在確實是非空陣列且至少含一筆合法資料時採用，否則退回預設。
 */
function mergeContactInfo(value: unknown): ContactInfo {
  const fallback = CONTACT_INFO_DEFAULT;
  if (!isPlainObject(value)) return fallback;

  const centersRaw = Array.isArray(value.centers)
    ? value.centers
        .map(normalizeCenter)
        .filter((c): c is ContactCenter => c !== null)
    : [];

  return {
    eyebrow: isString(value.eyebrow) ? value.eyebrow : fallback.eyebrow,
    title: isString(value.title) ? value.title : fallback.title,
    subtitle: isString(value.subtitle) ? value.subtitle : fallback.subtitle,
    centers: centersRaw.length > 0 ? centersRaw : fallback.centers,
  };
}

/**
 * 取得聯絡資訊（公開讀，is_public=true）。
 * DB 尚未 seed 或形狀損壞時退回 CONTACT_INFO_DEFAULT，確保前台不會 crash。
 */
export async function getContactInfo(): Promise<ContactInfo> {
  const value = await getSiteSetting<unknown>(CONTACT_INFO_KEY);
  if (value == null) return CONTACT_INFO_DEFAULT;
  return mergeContactInfo(value);
}
