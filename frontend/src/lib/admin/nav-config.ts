// 後台側欄導覽的單一事實來源（V2 並行友善化）。
//
// 每個內容 tab 的後台都在 /admin/<key> 底下；這裡先把區段列好，
// 各 tab 只需新增自己的 route 檔，不必修改共用側欄元件或本設定。
//
// V3-3：加入角色 gating。seo_manager 只看得到內容區（首頁設定 / 商品 / 最新消息 /
// 服務 / 節能實績 / 公司活動），看不到「網站設定」與「人員管理」。以每項的 roles 標示
// 可見角色，再用 navForRole() 過濾。

import type { AdminRole } from "./auth";

export interface AdminNavItem {
  key: string;
  label: string;
  href: string;
  /** 該後台路由是否已存在；false → 側欄顯示為 disabled，避免連到尚未建立的 404。
   *  各 tab 上線時把自己那行改 true（同前台 nav 的 ready flag）。 */
  enabled: boolean;
  /** 哪些角色看得到此項。預設（未指定）= admin + seo_manager 皆可見（內容團隊）。
   *  admin-only 的項目（網站設定 / 人員管理）標 roles: ['admin']。
   *  office（行政）是獨立 persona，只看得到明確標 roles: ['office'] 的項目
   *  （保養記錄卡），不會因「未指定」而看到 CMS 內容區。 */
  roles?: AdminRole[];
}

export const ADMIN_NAV: AdminNavItem[] = [
  { key: "dashboard", label: "總覽", href: "/admin", enabled: true },
  // SEO 總覽：跨五區檢視缺漏 + 快速編輯 meta。seo_manager 的主要工作區，admin 亦可進。
  { key: "seo", label: "SEO 總覽", href: "/admin/seo", enabled: true },
  {
    key: "analytics",
    label: "流量分析",
    href: "/admin/analytics",
    enabled: true,
  },
  // 首頁與品牌設定：品牌資產（LOGO / favicon）全站即時生效，故列入側欄；
  // 首頁區段內容因前台採過渡版面暫未顯示（頁內已標示），仍可預先編輯。
  { key: "home", label: "首頁與品牌", href: "/admin/home", enabled: true },
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
    enabled: true,
  },
  { key: "cases", label: "節能實績", href: "/admin/cases", enabled: true },
  { key: "events", label: "公司活動", href: "/admin/events", enabled: true },
  {
    key: "contact",
    label: "聯絡來信",
    href: "/admin/contact",
    enabled: true,
    roles: ["admin"],
  },
  {
    key: "settings",
    label: "網站設定",
    href: "/admin/settings",
    enabled: true,
    roles: ["admin"],
  },
  {
    key: "staff",
    label: "人員管理",
    href: "/admin/staff",
    enabled: true,
    roles: ["admin"],
  },
  {
    key: "maintenance",
    label: "保養記錄卡",
    href: "/admin/maintenance",
    enabled: true,
    roles: ["office"],
  },
];

// 未指定 roles 的項目預設可見角色 = 內容團隊（admin + seo_manager）。
// office 為獨立 persona，不含在預設內，故只會看到明確標 roles:['office'] 的項目。
const DEFAULT_ROLES: AdminRole[] = ["admin", "seo_manager"];

/** 依角色過濾側欄項目（未指定 roles → 內容團隊 admin + seo_manager 可見，office 除外）。 */
export function navForRole(role: AdminRole): AdminNavItem[] {
  return ADMIN_NAV.filter((item) =>
    (item.roles ?? DEFAULT_ROLES).includes(role),
  );
}
