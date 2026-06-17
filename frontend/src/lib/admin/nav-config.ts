// 後台側欄導覽的單一事實來源（V2 並行友善化）。
//
// 每個內容 tab 的後台都在 /admin/<key> 底下；這裡先把 9 個區段列好，
// 各 tab 只需新增自己的 route 檔，不必修改共用側欄元件或本設定。

export interface AdminNavItem {
  key: string;
  label: string;
  href: string;
  /** 該後台路由是否已存在；false → 側欄顯示為 disabled，避免連到尚未建立的 404。
   *  各 tab 上線時把自己那行改 true（同前台 nav 的 ready flag）。 */
  enabled: boolean;
}

export const ADMIN_NAV: AdminNavItem[] = [
  { key: "dashboard", label: "總覽", href: "/admin", enabled: true },
  { key: "home", label: "首頁設定", href: "/admin/home", enabled: true },
  { key: "brands", label: "品牌介紹", href: "/admin/brands", enabled: true },
  {
    key: "products",
    label: "商品介紹",
    href: "/admin/products",
    enabled: true,
  },
  { key: "news", label: "最新消息", href: "/admin/news", enabled: true },
  {
    key: "services",
    label: "服務項目",
    href: "/admin/services",
    enabled: false,
  },
  { key: "cases", label: "節能實績", href: "/admin/cases", enabled: false },
  { key: "events", label: "公司活動", href: "/admin/events", enabled: true },
  { key: "contact", label: "聯絡來信", href: "/admin/contact", enabled: false },
  {
    key: "settings",
    label: "網站設定",
    href: "/admin/settings",
    enabled: false,
  },
];
