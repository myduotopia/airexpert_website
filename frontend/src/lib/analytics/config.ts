// 分析與索引設定的「純」解析函式 — 無 server-only / DB 依賴，方便單元測試與在 layout / 設定頁重用。
// 存於 site_settings.analytics（is_public=true）：GA4 measurement id + GSC 驗證碼皆為公開值。

/** site_settings.analytics 的儲存形狀（value）。皆選填，未設定時不注入任何追蹤。 */
export interface AnalyticsValue {
  ga4_id?: string;
  gsc_verification?: string;
}

/** 正規化後的分析設定：空字串 / 非字串一律收斂為 null（未設定）。 */
export interface AnalyticsConfig {
  /** GA4 measurement id（如 G-XXXXXXXXXX）。null → 不注入 gtag。 */
  ga4Id: string | null;
  /** Google Search Console 驗證碼（content 值）。null → 不輸出 verification meta。 */
  gscVerification: string | null;
}

/** 非空字串才採用，否則回 null。trim 後判斷。 */
function strOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * 由儲存的 value 解析出正規化設定。value 可能為 null / 缺漏 / 型別不符 →
 * 安全退回（皆 null）。純函式，供 layout、設定頁 server action 與測試共用。
 */
export function parseAnalyticsConfig(
  value: AnalyticsValue | null | undefined,
): AnalyticsConfig {
  return {
    ga4Id: strOrNull(value?.ga4_id),
    gscVerification: strOrNull(value?.gsc_verification),
  };
}

/**
 * 基本檢驗 GA4 measurement id 形狀（G- 開頭 + 英數）。
 * 非強制（GA 偶有非 G- 前綴歷史 id），僅供設定頁提示；解析仍以 parseAnalyticsConfig 為準。
 */
export function isLikelyGa4Id(id: string): boolean {
  return /^G-[A-Z0-9]{4,}$/i.test(id.trim());
}
