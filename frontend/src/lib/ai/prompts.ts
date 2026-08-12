// AI Prompt 管理 — 內建第一版 prompt + 後台可覆寫（site_settings.ai_prompts）。
//
// 三段可編輯 prompt：
//   * fix_article：AI 修文（修正錯字 / 語法、補完內容，輸出乾淨 HTML）。
//   * fill_seo：依內文一鍵產生 SEO meta。
//   * gen_body：依摘要生成完整內文 HTML。
//
// 解析規則（resolveAiPrompts，純函式以利測試）：
//   後台存的值若為「非空白字串」→ 採用；否則（缺欄位 / 空字串 / 空白）→ 退回 DEFAULTS。
//   ＝＞ 後台把欄位清空儲存，等同「還原預設」。
//
// getAiPrompts() 為 SERVER ONLY（以 service_role 讀 is_public=false 的 ai_prompts）。

export const AI_PROMPTS_KEY = "ai_prompts";

export interface AiPrompts {
  /** 修文 prompt：要求輸出乾淨 HTML（僅 sanitize allowlist 標籤）。 */
  fix_article: string;
  /** 一鍵填 SEO prompt：要求回傳 JSON 形式的 SEO meta。 */
  fill_seo: string;
  /** 依摘要生成內文 prompt：把摘要擴寫成完整內文 HTML（僅 sanitize allowlist 標籤）。 */
  gen_body: string;
}

/**
 * 內建第一版 prompt（繁體中文）。後台未設定或清空時採用。
 * 文案放在 prompt 內、實際內容（HTML / title / text）由呼叫端附加於 prompt 之後。
 */
export const DEFAULT_AI_PROMPTS: AiPrompts = {
  fix_article: `你是「超勁賀空壓科技」官網的中文文字編輯。請針對下方提供的文章 HTML 進行潤飾：
1. 修正錯字、標點與語法錯誤，讓語句通順自然。
2. 在不偏離原意的前提下，適度補完不完整的句子或段落，使內容更專業、更完整、更利於 SEO。
3. 維持繁體中文（台灣用語），語氣專業而平實，不可誇大不實或杜撰規格數據。
4. 保留原有的段落結構與重點。

輸出格式要求（務必遵守）：
- 只輸出修潤後的「內文 HTML」本身，不要加上任何說明、前言、結語或 Markdown 標記（不要用 \`\`\`html 包起來）。
- HTML 僅能使用這些標籤：<h2> <h3> <h4> <p> <ul> <ol> <li> <strong> <em> <blockquote> <a> <br>。
- 不可輸出 <script> <style> <iframe>、行內 style、onclick 等事件屬性，或 <html>/<body> 等外層標籤。`,
  fill_seo: `你是「超勁賀空壓科技」官網的 SEO 專員。請根據下方提供的文章標題與內文，產生一組適合搜尋引擎與社群分享的 SEO meta。

要求：
- 全部使用繁體中文（台灣用語），精準描述內容、自然帶入關鍵字，不要關鍵字堆砌或誇大不實。
- 若下方提供「重點關鍵字／提示」，請以其為主要優化方向（約 60% 權重），其餘約 40% 參考標題與內文；仍須通順、符合搜尋意圖，不得堆砌或誇大。
- seo_title 不超過 60 個字；seo_description 約 70～155 個字。
- slug 僅能用小寫英文、數字與連字號（-），簡短且具語意，例如 inverter-air-compressor-energy-saving。
- jsonld 為選填；若內容適合，可給一個合法的 schema.org JSON-LD 物件（例如 Article 或 Product），否則回傳 null。

回傳「純 JSON 物件」（不要加任何說明文字或 Markdown 標記），欄位如下：
- seo_title：SEO 標題
- seo_description：SEO 描述
- og_title：社群分享標題（可同 seo_title）
- og_description：社群分享描述（可同 seo_description）
- slug：建議網址代稱
- jsonld：schema.org 結構化資料物件，或 null`,
  gen_body: `你是「超勁賀空壓科技」官網的中文內容編輯。請依據下方提供的「文章摘要」（必要時參考標題），擴寫成一篇完整、專業的繁體中文官網內文：
1. 忠於摘要的重點與方向，不偏題、不杜撰規格數據或誇大不實。
2. 結構清楚，適度分段、可用小標與條列，內容具體、利於 SEO。
3. 維持繁體中文（台灣用語），語氣專業而平實。

輸出格式要求（務必遵守）：
- 只輸出「內文 HTML」本身，不要加上任何說明、前言、結語或 Markdown 標記（不要用 \`\`\`html 包起來）。
- HTML 僅能使用這些標籤：<h2> <h3> <h4> <p> <ul> <ol> <li> <strong> <em> <blockquote> <a> <br>。
- 不可輸出 <script> <style> <iframe>、行內 style、onclick 等事件屬性，或 <html>/<body> 等外層標籤。`,
};

type AiPromptsValue = {
  fix_article?: unknown;
  fill_seo?: unknown;
  gen_body?: unknown;
};

/**
 * 把後台儲存值（可能缺欄位 / 空字串）解析成「有效 prompt」：
 * 非空白字串才採用，否則退回對應的 DEFAULT。純函式，client-safe，便於測試。
 */
export function resolveAiPrompts(stored: AiPromptsValue | null | undefined): {
  effective: AiPrompts;
  /** 各欄位實際來源，供 UI 標示「目前為預設 / 自訂」。 */
  source: {
    fix_article: "default" | "custom";
    fill_seo: "default" | "custom";
    gen_body: "default" | "custom";
  };
} {
  const pick = (
    raw: unknown,
    fallback: string,
  ): [string, "default" | "custom"] => {
    if (typeof raw === "string" && raw.trim() !== "") return [raw, "custom"];
    return [fallback, "default"];
  };

  const [fix_article, fixSrc] = pick(
    stored?.fix_article,
    DEFAULT_AI_PROMPTS.fix_article,
  );
  const [fill_seo, seoSrc] = pick(
    stored?.fill_seo,
    DEFAULT_AI_PROMPTS.fill_seo,
  );
  const [gen_body, genSrc] = pick(
    stored?.gen_body,
    DEFAULT_AI_PROMPTS.gen_body,
  );

  return {
    effective: { fix_article, fill_seo, gen_body },
    source: { fix_article: fixSrc, fill_seo: seoSrc, gen_body: genSrc },
  };
}
