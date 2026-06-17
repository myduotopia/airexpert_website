// 公開（anon）前端資料存取層 — SERVER ONLY 的 barrel。
//
// V2 起，原本單檔的 data.ts 依 domain 拆分到 `./data/*`，以利 8 個 tab 並行開發
// （各 tab 只改自己的 domain 檔，避免共改一檔的衝突）。本檔重新匯出所有 helper，
// 既有的 `import { ... } from "@/lib/data"` 不受影響。
//
// 各 domain 檔皆標記 `server-only`：client component 誤從此 barrel 匯入會立即報錯。
// 聯絡表單送出請改用 `./contact`。

export { CACHE_TAGS, REVALIDATE_SECONDS } from "./data/cache";

// 商品介紹
export {
  getPublishedProducts,
  getProductsByCategory,
  getProductBySlug,
} from "./data/products";

// 最新消息
export {
  getPublishedArticles,
  getArticlesByCategory,
  getArticleBySlug,
} from "./data/articles";

// 節能實績
export {
  getPublishedCases,
  getCasesByCategory,
  getCaseBySlug,
} from "./data/cases";

// 公司活動（影片 + 相簿）
export {
  getPublishedEvents,
  getPublishedPhotoAlbums,
  getPhotoAlbumBySlug,
} from "./data/events";

// 品牌介紹（V2 新表）
export { getPublishedBrands, getBrandBySlug } from "./data/brands";

// 服務項目（V2 新表）
export { getPublishedServices, getServiceBySlug } from "./data/services";

// 全域內容 / 設定（V2 新表）
export { getSiteSetting } from "./data/site";

// 聯絡資訊（site_settings key=contact_info）
export {
  getContactInfo,
  CONTACT_INFO_KEY,
  CONTACT_INFO_DEFAULT,
  type ContactInfo,
  type ContactCenter,
  type ContactLine,
} from "./data/contact-info";
