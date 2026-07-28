// 首頁區段的 site_settings key —— client-safe（不 import "server-only"），
// 故 client 表單（SectionForms）與 server（home.ts / home-sections.ts）可共用同一份來源，
// 避免 client 透過 home.ts 連帶把 "server-only" 模組打進瀏覽器 bundle。
export const HOME_KEYS = {
  carousel: "home_carousel",
  stats: "home_stats",
  caseStudy: "home_case",
  tech: "home_tech",
  news: "home_news",
  products: "home_products",
  features: "home_features",
  social: "home_social",
} as const;
