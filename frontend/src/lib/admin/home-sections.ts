// 後台共用：把首頁各區段的「友善表單欄位」解析成可寫入 site_settings 的 value 形狀。
//
// 純函式（無 server-only / 無 DB），方便單元測試。對應的後台表單在
// app/admin/(protected)/home/sections/*；FormData 的欄位命名須與此處一致。
//
// 可重複列（slides / items / features / categories / companies）以索引化的欄位名
// 序列化：`slides[0].headline`、`slides[1].headline`…，外加一個 `slides.count`
// 表示列數。解析時逐列讀取、trim 字串、跳過整列全空者；icon 則強制收斂到允許清單。
import type {
  HomeCarousel,
  HomeStats,
  HomeTech,
  HomeNews,
  HomeProducts,
  HomeFeatures,
  HomeSocial,
} from "@/lib/data/home";
import type {
  HomeCaseCollection,
  HomeCaseInput,
} from "@/components/home/content";
// 用 client-safe 的 home-keys（本檔的 icon options 會被 client 表單匯入，
// 不可經由 home.ts 連帶拉進 "server-only"）。
import { HOME_KEYS } from "@/lib/data/home-keys";

// ---------- 允許的設定鍵（白名單）----------
export const HOME_SECTION_KEYS = new Set<string>(Object.values(HOME_KEYS));

// ---------- icon 允許清單（含中文說明，供下拉選單顯示）----------
export interface IconOption {
  value: string;
  label: string;
}

/** 永續節能（tech）可用圖示。 */
export const TECH_ICON_OPTIONS: IconOption[] = [
  { value: "ruler", label: "ruler（量尺／基線量測）" },
  { value: "badge-check", label: "badge-check（認證徽章）" },
  { value: "line-chart", label: "line-chart（折線圖／追蹤）" },
];

/** 產品特色（features）可用圖示。 */
export const FEATURE_ICON_OPTIONS: IconOption[] = [
  { value: "zap", label: "zap（閃電／節能）" },
  { value: "shield-check", label: "shield-check（盾牌／潔淨）" },
  { value: "activity", label: "activity（脈搏／智慧監控）" },
  { value: "thermometer", label: "thermometer（溫度計／溫控）" },
  { value: "volume-x", label: "volume-x（靜音／低噪音）" },
  { value: "leaf", label: "leaf（葉片／永續減碳）" },
];

const TECH_ICONS = TECH_ICON_OPTIONS.map((o) => o.value);
const FEATURE_ICONS = FEATURE_ICON_OPTIONS.map((o) => o.value);

// ---------- 小工具 ----------
function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function count(fd: FormData, prefix: string): number {
  const n = Number.parseInt(String(fd.get(`${prefix}.count`) ?? "0"), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** icon 強制收斂到允許清單，未對應時退回清單第一個（穩定預設）。 */
function coerceIcon(value: string, allowed: string[]): string {
  return allowed.includes(value) ? value : allowed[0];
}

/**
 * 逐列讀取可重複列。row(index) 回傳該列解析後物件；keep(row) 決定是否保留
 * （整列全空者跳過）。回傳已過濾的陣列。
 */
function parseRows<T>(
  fd: FormData,
  prefix: string,
  row: (index: number) => T,
  keep: (row: T) => boolean,
): T[] {
  const out: T[] = [];
  const n = count(fd, prefix);
  for (let i = 0; i < n; i += 1) {
    const r = row(i);
    if (keep(r)) out.push(r);
  }
  return out;
}

// ---------- 各區段解析 ----------

export function parseCarousel(fd: FormData): HomeCarousel {
  const slides = parseRows(
    fd,
    "slides",
    (i) => ({
      image_url: str(fd, `slides[${i}].image_url`),
      alt: str(fd, `slides[${i}].alt`),
      category: str(fd, `slides[${i}].category`),
      headline: str(fd, `slides[${i}].headline`),
      tagline: str(fd, `slides[${i}].tagline`),
    }),
    // 必須有圖片才保留：投影片以 next/image 全幅渲染，空 src 會讓首頁 render 崩潰。
    (r) => r.image_url !== "",
  );
  return { slides };
}

/** 情境標籤：以逗號（半形/全形）或頓號分隔 → 去空白、濾空。 */
function splitTags(raw: string): string[] {
  return raw
    .split(/[,、，]/)
    .map((t) => t.trim())
    .filter((t) => t !== "");
}

/**
 * 客戶實績（多個案 + 切換展示）。每列一筆扁平個案；`selectedIndex` 由隱藏欄位
 * 帶入「視覺列索引」，解析時對應到被保留列的實際位置（跳過的空/缺圖列不佔位）。
 * 保留條件：改善前、後兩張圖都要有（CollagePhoto 以 next/image 全幅渲染，空 src 會崩）。
 */
export function parseCaseStudy(fd: FormData): HomeCaseCollection {
  const n = count(fd, "cases");
  const selectedRaw = Number.parseInt(
    String(fd.get("selectedIndex") ?? ""),
    10,
  );
  const selectedVisual = Number.isFinite(selectedRaw) ? selectedRaw : -1;

  const cases: HomeCaseInput[] = [];
  let selectedIndex = 0;
  for (let i = 0; i < n; i += 1) {
    const c: HomeCaseInput = {
      client: str(fd, `cases[${i}].client`),
      tags: splitTags(str(fd, `cases[${i}].tags`)),
      beforeImage: str(fd, `cases[${i}].beforeImage`),
      afterImage: str(fd, `cases[${i}].afterImage`),
      logo: str(fd, `cases[${i}].logo`),
      energyRate: str(fd, `cases[${i}].energyRate`),
      annualSaving: str(fd, `cases[${i}].annualSaving`),
      roi: str(fd, `cases[${i}].roi`),
      carbon: str(fd, `cases[${i}].carbon`),
    };
    if (c.beforeImage === "" || c.afterImage === "") continue;
    if (i === selectedVisual) selectedIndex = cases.length;
    cases.push(c);
  }
  if (selectedIndex >= cases.length) selectedIndex = 0;
  return { selectedIndex: cases.length > 0 ? selectedIndex : 0, cases };
}

export function parseStats(fd: FormData): HomeStats {
  const items = parseRows(
    fd,
    "items",
    (i) => ({
      value: str(fd, `items[${i}].value`),
      label: str(fd, `items[${i}].label`),
    }),
    (r) => r.value !== "" || r.label !== "",
  );
  return { items };
}

export function parseTech(fd: FormData): HomeTech {
  const features = parseRows(
    fd,
    "features",
    (i) => ({
      icon: coerceIcon(str(fd, `features[${i}].icon`), TECH_ICONS),
      title: str(fd, `features[${i}].title`),
      description: str(fd, `features[${i}].description`),
    }),
    (r) => r.title !== "" || r.description !== "",
  );
  return {
    eyebrow: str(fd, "eyebrow"),
    title: str(fd, "title"),
    description: str(fd, "description"),
    features,
  };
}

export function parseNews(fd: FormData): HomeNews {
  return {
    eyebrow: str(fd, "eyebrow"),
    title: str(fd, "title"),
  };
}

export function parseProducts(fd: FormData): HomeProducts {
  const categories = parseRows(
    fd,
    "categories",
    (i) => ({
      image_url: str(fd, `categories[${i}].image_url`),
      name: str(fd, `categories[${i}].name`),
      desc: str(fd, `categories[${i}].desc`),
    }),
    // 必須有圖片才保留：分類卡以 next/image 渲染，空 src 會讓首頁 render 崩潰。
    (r) => r.image_url !== "",
  );
  return {
    eyebrow: str(fd, "eyebrow"),
    title: str(fd, "title"),
    description: str(fd, "description"),
    categories,
  };
}

export function parseFeatures(fd: FormData): HomeFeatures {
  const features = parseRows(
    fd,
    "features",
    (i) => ({
      icon: coerceIcon(str(fd, `features[${i}].icon`), FEATURE_ICONS),
      title: str(fd, `features[${i}].title`),
      desc: str(fd, `features[${i}].desc`),
    }),
    (r) => r.title !== "" || r.desc !== "",
  );
  return {
    eyebrow: str(fd, "eyebrow"),
    title: str(fd, "title"),
    features,
  };
}

export function parseSocial(fd: FormData): HomeSocial {
  const companies = parseRows(
    fd,
    "companies",
    (i) => ({
      region: str(fd, `companies[${i}].region`),
      name: str(fd, `companies[${i}].name`),
      line: str(fd, `companies[${i}].line`),
      fb: str(fd, `companies[${i}].fb`),
    }),
    (r) => r.region !== "" || r.name !== "" || r.line !== "" || r.fb !== "",
  );
  return {
    eyebrow: str(fd, "eyebrow"),
    title: str(fd, "title"),
    description: str(fd, "description"),
    companies,
  };
}

/**
 * 依設定鍵分派到對應解析器，回傳要寫入 site_settings 的 value 物件。
 * key 不在白名單時回傳 null（caller 拒絕寫入）。
 */
export function parseHomeSection(key: string, fd: FormData): unknown | null {
  switch (key) {
    case HOME_KEYS.carousel:
      return parseCarousel(fd);
    case HOME_KEYS.stats:
      return parseStats(fd);
    case HOME_KEYS.caseStudy:
      return parseCaseStudy(fd);
    case HOME_KEYS.tech:
      return parseTech(fd);
    case HOME_KEYS.news:
      return parseNews(fd);
    case HOME_KEYS.products:
      return parseProducts(fd);
    case HOME_KEYS.features:
      return parseFeatures(fd);
    case HOME_KEYS.social:
      return parseSocial(fd);
    default:
      return null;
  }
}
