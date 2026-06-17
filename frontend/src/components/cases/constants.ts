// 節能實績（Cases）分類的單一事實來源。
// cases.category 以這些 value 存入 DB；前台 FilterRow pills、後台表單下拉、
// server action 的分類白名單驗證皆引用此處。
//
// 設計稿（V3.08 / Cases, frame kF0HO）的 FilterRow 仍沿用 News 的 pills（佔位），
// 但 issue #34 規格定 2 個分類（空壓機 / 乾燥機）。以 issue 為準；未來要擴充只需在此加一筆。

export const CASE_CATEGORIES = ["空壓機", "乾燥機"] as const;

export type CaseCategory = (typeof CASE_CATEGORIES)[number];

/** FilterRow「全部」的特殊值（非 DB 分類）。 */
export const CASE_FILTER_ALL = "全部";
