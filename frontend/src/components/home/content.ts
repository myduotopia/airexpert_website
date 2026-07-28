// 首頁改版（issue #97）新區塊的靜態內容 —— 客戶實績(Cases)、服務流程(Service)、
// 聯繫資訊細節(Contact details)。這些先以 mockup 數據呈現、之後由業主補實際內容，
// 為避免牽動既有 site_settings / 後台 SectionForms（本次不做新區塊後台表單），
// 暫以型別化常數集中於此，元件直接 import。圖示以 lucide 名稱字串表示，由元件對應。

/** 客戶實績的一筆 ROI 指標（右側數據列）。icon 為 lucide 名稱，由元件對應。 */
export interface RoiMetric {
  icon: string;
  label: string;
  /** 數值字串，可含前後綴（AnimatedNumber 會 count-up 其中的數字）。 */
  value: string;
}

/** 客戶實績個案：左側改善前/後 collage、右側 ROI 數據。 */
export interface HomeCaseStudy {
  /** 匿名客戶稱呼（不揭露公司名）。 */
  client: string;
  /** 情境標籤（左側 chips）。 */
  tags: string[];
  /** 改善前照片（collage 左上）。 */
  beforeImage: string;
  /** 改善後照片（collage 右下）。 */
  afterImage: string;
  /** 去背 logo（壓在改善後照片右下角）。 */
  logo: string;
  /** 浮動亮點徽章（壓在 collage 左下角）。 */
  spotlight: RoiMetric;
  /** 右側面板主打大數字（第 1 項）＋支撐數據（其餘）。 */
  metrics: RoiMetric[];
}

/** 首頁客戶實績（匿名 · 實際 ROI 數據）。 */
export const HOME_CASE: HomeCaseStudy = {
  client: "機械製造廠",
  tags: ["製造業", "變頻空壓系統", "ESG 減碳"],
  beforeImage: "/cases/1_0.jpg",
  afterImage: "/cases/2_0.jpg",
  logo: "/cases/logo.png",
  spotlight: { icon: "clock", label: "投資回收", value: "1.5 年" },
  metrics: [
    { icon: "zap", label: "節電率高達", value: "32.68%" },
    { icon: "wallet", label: "年省電費", value: "約 385 萬" },
    { icon: "clock", label: "投資回收期 (ROI)", value: "1.5 年" },
    { icon: "leaf", label: "綠色減碳效益", value: "年減約 476 噸 CO₂e" },
  ],
};

// ---------- 首頁客戶實績：後台可編輯（多個案 + 切換）----------
// 後台以「扁平數字欄位」編輯每筆個案（指標的標籤與圖示為設計固定值，僅數字/圖片/名稱/標籤可改）。
// site_settings 以 collection 形狀（selectedIndex + cases[]）儲存；前台 render 時 resolve
// 成上方 HomeCaseStudy 形狀（CasesSection 結構與動畫維持不變）。

/** 後台可編輯的單筆個案（扁平欄位；指標標籤/圖示不在此，於映射時補上固定值）。 */
export interface HomeCaseInput {
  /** 個案名稱（標題「◯◯◯節能改造」＋右側面板名稱）。 */
  client: string;
  /** 情境標籤 chips。 */
  tags: string[];
  /** 改善前照片（collage 左上）。 */
  beforeImage: string;
  /** 改善後照片（collage 右下）。 */
  afterImage: string;
  /** 去背 logo（壓改善後右下；可留空）。 */
  logo: string;
  /** 節電率高達（主打大數字），如 "32.68%"。 */
  energyRate: string;
  /** 年省電費，如 "約 385 萬"。 */
  annualSaving: string;
  /** 投資回收期 (ROI)，如 "1.5 年"；同時帶動左下浮動亮點徽章。 */
  roi: string;
  /** 綠色減碳效益，如 "年減約 476 噸 CO₂e"。 */
  carbon: string;
}

/** 首頁客戶實績整體設定：多筆個案 + 目前展示哪一筆（cases 內的索引）。 */
export interface HomeCaseCollection {
  selectedIndex: number;
  cases: HomeCaseInput[];
}

/** 目前設計預設的單筆個案（數字與 HOME_CASE 對齊）。 */
export const HOME_CASE_DEFAULT_INPUT: HomeCaseInput = {
  client: "機械製造廠",
  tags: ["製造業", "變頻空壓系統", "ESG 減碳"],
  beforeImage: "/cases/1_0.jpg",
  afterImage: "/cases/2_0.jpg",
  logo: "/cases/logo.png",
  energyRate: "32.68%",
  annualSaving: "約 385 萬",
  roi: "1.5 年",
  carbon: "年減約 476 噸 CO₂e",
};

/** DB 未 seed 時的預設 collection（單筆，視覺與現況一致）。 */
export const HOME_CASE_DEFAULT_COLLECTION: HomeCaseCollection = {
  selectedIndex: 0,
  cases: [HOME_CASE_DEFAULT_INPUT],
};

/** 扁平個案 → render 用的 HomeCaseStudy（補上設計固定的指標標籤與圖示）。 */
export function toCaseStudy(input: HomeCaseInput): HomeCaseStudy {
  return {
    client: input.client,
    tags: input.tags,
    beforeImage: input.beforeImage,
    afterImage: input.afterImage,
    logo: input.logo,
    spotlight: { icon: "clock", label: "投資回收", value: input.roi },
    metrics: [
      { icon: "zap", label: "節電率高達", value: input.energyRate },
      { icon: "wallet", label: "年省電費", value: input.annualSaving },
      { icon: "clock", label: "投資回收期 (ROI)", value: input.roi },
      { icon: "leaf", label: "綠色減碳效益", value: input.carbon },
    ],
  };
}

/**
 * 由 collection 取出目前要展示的個案並映射成 HomeCaseStudy。
 * 容錯：cases 非陣列 / 空集合、索引越界、選中個案缺改善前後圖 → 退回設計預設 HOME_CASE，
 * 確保前台 server render 不因後台壞資料而崩潰（CollagePhoto 以 next/image 全幅渲染，空 src 會崩）。
 */
export function resolveHomeCase(collection: HomeCaseCollection): HomeCaseStudy {
  const cases = Array.isArray(collection?.cases) ? collection.cases : [];
  if (cases.length === 0) return HOME_CASE;
  const raw = collection?.selectedIndex;
  const idx =
    typeof raw === "number" &&
    Number.isInteger(raw) &&
    raw >= 0 &&
    raw < cases.length
      ? raw
      : 0;
  const input = cases[idx];
  if (!input || !input.beforeImage || !input.afterImage) return HOME_CASE;
  return toCaseStudy({
    ...input,
    tags: Array.isArray(input.tags) ? input.tags : [],
  });
}

/**
 * 指標性客戶。卡片內只顯示 logo（name 僅供 alt）；有股票代號者於 logo 下方
 * 加一行「上市公司股票代號：xxxx」，未上市者不顯示該行。
 */
export interface HomeClient {
  name: string;
  /** logo 圖檔路徑；查無官方 logo 檔時留空，改以 wordmark / 公司名文字呈現。 */
  logo?: string;
  /**
   * 無 logo 圖檔時的替代字標（向量文字、任何尺寸都銳利）。
   * text = 主字（品牌色），sub = 下方小字。
   */
  wordmark?: { text: string; sub?: string };
  /** 卡片內 logo 下方的文字（例如只有圖標、無公司名的 logo）。 */
  caption?: string;
  /** 上市公司股票代號；未上市留空（不顯示代號行）。 */
  code?: string;
}

export const HOME_CLIENTS: HomeClient[] = [
  { name: "家登精密工業", logo: "/clients/gudeng.svg", code: "3680" },
  { name: "家碩科技", logo: "/clients/gdauto.png", code: "6953" },
  { name: "全球傳動科技", logo: "/clients/tbi.png", code: "4540" },
  { name: "兆利科技工業", logo: "/clients/jarllytec.png", code: "3548" },
  { name: "和成欣業 HCG", logo: "/clients/hcg.svg", code: "1810" },
  { name: "巧新科技工業", logo: "/clients/superalloy.svg", code: "1563" },
  { name: "春源鋼鐵", logo: "/clients/cysteel.svg", code: "2010" },
  { name: "景美科技", logo: "/clients/cmat.svg", code: "7899" },
  { name: "大毅科技", logo: "/clients/tai.svg", code: "2478" },
  // 悅城科技：官網無可用的 logo 圖檔（僅有廠房 banner），改以向量字標呈現（銳利、可縮放）。
  {
    name: "悅城科技 ONANO",
    wordmark: { text: "ONANO", sub: "ONANO INDUSTRIAL CORP." },
    code: "6405",
  },
  { name: "台灣積層工業", logo: "/clients/lamination.png", code: "8999" },
  { name: "力鵬企業", logo: "/clients/lipeng.png", code: "1447" },
  { name: "千興不銹鋼", logo: "/clients/chienshing.png", code: "2025" },
  { name: "榮剛材料科技", logo: "/clients/gmtc.svg", code: "5009" },
  { name: "建通精密工業", logo: "/clients/gem.svg", code: "2460" },
  { name: "正瀚生技", logo: "/clients/chbio.svg", code: "6534" },
  { name: "安心食品服務 摩斯漢堡", logo: "/clients/mos.png", code: "1259" },
  { name: "三星科技", logo: "/clients/sanshing.svg", code: "5007" },
  { name: "台橡 TSRC", logo: "/clients/tsrc.svg", code: "2103" },
  // 以下未上市，不顯示股票代號行（排在最後，讓有代號者版面一致）。
  { name: "碩頂精密工業", logo: "/clients/suting.png" },
  // 圓達 logo 只有圖標無文字：圖標縮小 + 下方補「圓達科技」。
  { name: "圓達科技", logo: "/clients/fusiontech.png", caption: "圓達科技" },
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
