// 首頁改版（issue #97）新區塊的靜態內容 —— 客戶實績(Cases)、服務流程(Service)、
// 聯繫資訊細節(Contact details)。這些先以 mockup 數據呈現、之後由業主補實際內容，
// 為避免牽動既有 site_settings / 後台 SectionForms（本次不做新區塊後台表單），
// 暫以型別化常數集中於此，元件直接 import。圖示以 lucide 名稱字串表示，由元件對應。

/** Cases 卡片內的 before / after 單一長條。pct 為長條相對寬度（0–100）。 */
export interface HomeCaseBar {
  label: string;
  value: string;
  pct: number;
}

export interface HomeCase {
  /** 產業別（深色卡左上 chip）。 */
  industry: string;
  /** 減碳幅度（右上金色徽章），例：「−36%」。 */
  reduction: string;
  before: HomeCaseBar;
  after: HomeCaseBar;
  /** 卡片底部年省電費文案。 */
  saving: string;
}

/** 客戶實績（模擬數據，實際案例待業主提供）。 */
export const HOME_CASES: HomeCase[] = [
  {
    industry: "半導體大廠",
    reduction: "減碳 −36%",
    before: { label: "導入前 月電費", value: "88 萬", pct: 100 },
    after: { label: "導入後 月電費", value: "56 萬", pct: 64 },
    saving: "年省電費 320 萬",
  },
  {
    industry: "食品飲料廠",
    reduction: "減碳 −31%",
    before: { label: "導入前 月電費", value: "42 萬", pct: 100 },
    after: { label: "導入後 月電費", value: "27 萬", pct: 64 },
    saving: "年省電費 180 萬",
  },
];

export interface HomeServiceStep {
  /** lucide 圖示名稱（由 ServiceProcess 對應成元件）。 */
  icon: string;
  title: string;
  /** 步驟下方的金色 chip 標語。 */
  chip: string;
}

/** 服務流程 5 步驟。 */
export const HOME_SERVICE_STEPS: HomeServiceStep[] = [
  { icon: "clipboard-list", title: "需求診斷", chip: "免費能效檢測" },
  { icon: "cpu", title: "節能規劃", chip: "客製化氣體解決方案" },
  { icon: "hard-hat", title: "系統建置", chip: "專業安裝・施工驗收" },
  { icon: "calendar-check", title: "定期保養", chip: "巡檢維護・穩定供氣" },
  { icon: "headset", title: "售後支援", chip: "24H 線上叫修系統" },
];

/** 聯繫卡的補充聯絡資訊（電話 / 地址 / email）。以「服務中心 region」為 key，
 * 對應 home.social.companies 的 region 欄位；查無時該卡不顯示這些細節。 */
export interface ContactDetail {
  tollFree: string;
  phone: string;
  address: string;
  email: string;
}

export const HOME_CONTACT_DETAILS: Record<string, ContactDetail> = {
  北區服務中心: {
    tollFree: "0800-88-4588",
    phone: "02-2675-9977",
    address: "新北市樹林區備內街 136 號 1 樓",
    email: "Service@airexpert.com.tw",
  },
  南區服務中心: {
    tollFree: "0800-88-4588",
    phone: "07-699-8686",
    address: "高雄市湖內區中山路二段 256 號",
    email: "support8686@airexpert.com.tw",
  },
};
