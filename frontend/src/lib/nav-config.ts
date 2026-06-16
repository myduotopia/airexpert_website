// 前台主導覽的單一事實來源（V2 並行友善化）。
//
// 8 個 nav 大項目集中於此：每個 tab 上線時只需把自己那行的 `ready` 改成 true
// （一行、單檔、低衝突），不必動 Header.tsx / Footer.tsx。
// 未 ready 的 section 會導向 /maintenance（沿用 interim launch 行為）。
//
// 註：最終的視覺排序 / 樣式依 airexpert.pen 在 #29 定稿；本檔為「結構」事實來源。

export type NavKey =
  | "home"
  | "brands"
  | "products"
  | "news"
  | "services"
  | "cases"
  | "events"
  | "contact";

export interface NavSection {
  key: NavKey;
  /** 中文標籤。 */
  label: string;
  /** 最終路由。 */
  href: string;
  /** 該 tab 是否已上線；false → 導向 /maintenance。 */
  ready: boolean;
}

export const MAINTENANCE_HREF = "/maintenance";

export const PRIMARY_NAV: NavSection[] = [
  { key: "home", label: "首頁", href: "/", ready: true },
  { key: "brands", label: "品牌介紹", href: "/brands", ready: true },
  { key: "products", label: "商品介紹", href: "/products", ready: true },
  { key: "news", label: "最新消息", href: "/news", ready: false },
  { key: "services", label: "服務項目", href: "/services", ready: false },
  { key: "cases", label: "節能實績", href: "/cases", ready: false },
  { key: "events", label: "公司活動", href: "/events", ready: true },
  { key: "contact", label: "聯絡我們", href: "/contact", ready: true },
];

/** 導覽實際連結：未上線的 section 導向維護頁。 */
export function navHref(section: NavSection): string {
  return section.ready ? section.href : MAINTENANCE_HREF;
}
