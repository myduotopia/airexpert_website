// 最新消息（News）分類的單一事實來源。
// articles.category 以這些 value 存入 DB；前台 FilterRow pills、後台表單下拉皆引用此處。
//
// 註：設計稿（V3.08 / News, frame rhx08）的 FilterRow 列了較多 pills（產品發表/技術專文…），
// 但 issue #32 規格定 3 個分類。以 issue 為準；未來要擴充只需在此加一筆。

export const NEWS_CATEGORIES = ["新聞快訊", "新機發表", "ESG實績"] as const;

export type NewsCategory = (typeof NEWS_CATEGORIES)[number];

/** FilterRow「全部」的特殊值（非 DB 分類）。 */
export const NEWS_FILTER_ALL = "全部";
