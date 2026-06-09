// The 6 product categories from the schema (`products.category`). These are the
// canonical display + data strings; the home "Overview" uses a looser grouping
// (空氣壓縮機 / 真空泵浦 / 鼓風機 / 乾燥機) but data filtering uses these exact values.
export const PRODUCT_CATEGORIES = [
  "變頻空壓機",
  "變頻真空泵",
  "變頻鼓風機",
  "離心式空壓機",
  "冷凍式乾燥機",
  "吸附式乾燥機",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

/** Sentinel value for the "全部" (all) filter chip. */
export const ALL_CATEGORY = "全部";
