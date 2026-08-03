// Gemini（Google AI Studio）內容生成 — SERVER ONLY。
// API key 來源順序：後台設定（site_settings.ai_config，AES 解密）▸ GEMINI_API_KEY env。
// key 只在 server 端使用，絕不送瀏覽器。
import "server-only";

import { getAdminSupabase } from "../supabase-admin";
import { decryptSecret } from "../crypto";
import { sanitizeBodyHtml } from "../sanitize";
import { getAiPrompts } from "./prompts-server";

export const AI_CONFIG_KEY = "ai_config";
// gemini-2.0-flash 已於 2026-06-01 停用；預設改用 2.5 Flash。
const DEFAULT_MODEL = "gemini-2.5-flash";
// 503 過載時的備援模型（較輕量、較不易過載）。
export const FALLBACK_MODEL = "gemini-2.5-flash-lite";
// 單一模型最多嘗試次數（含首次）。
const MAX_ATTEMPTS = 3;

/** 哪些 HTTP 狀態屬「暫時性」可重試（429 限流 / 500 / 503 過載）。純函式，便於測試。 */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 503;
}

/**
 * 指數退避毫秒數（base 500 * 2^(attempt-1)）：attempt 1→500、2→1000、3→2000。
 * 無隨機抖動，方便測試與推理。純函式。
 */
export function backoffMs(attempt: number): number {
  return 500 * 2 ** (attempt - 1);
}

/** 延遲指定毫秒；可被測試以注入版本取代，避免真的等待。 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** callGemini 過載（503）丟出的錯誤帶上此旗標，供上層決定是否切備援模型。 */
class GeminiHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GeminiHttpError";
  }
}

export interface AiConfig {
  apiKey: string | null;
  model: string;
  source: "db" | "env" | "none";
  /** 後台是否已設定 key（供設定頁顯示遮罩用，不回傳明文）。 */
  hasDbKey: boolean;
}

type AiConfigValue = { gemini_key_enc?: string; model?: string };

/** 讀取 AI 設定。SERVER ONLY；以 service_role 讀 is_public=false 的 ai_config。 */
export async function getAiConfig(): Promise<AiConfig> {
  const { data } = await getAdminSupabase()
    .from("site_settings")
    .select("value")
    .eq("key", AI_CONFIG_KEY)
    .maybeSingle();
  const v = (data?.value ?? {}) as AiConfigValue;
  const model = v.model || DEFAULT_MODEL;

  if (v.gemini_key_enc) {
    try {
      return {
        apiKey: decryptSecret(v.gemini_key_enc),
        model,
        source: "db",
        hasDbKey: true,
      };
    } catch {
      // 解密失敗（例如換了 SETTINGS_ENC_KEY）→ 退回 env
    }
  }
  const env = process.env.GEMINI_API_KEY;
  if (env)
    return {
      apiKey: env,
      model,
      source: "env",
      hasDbKey: Boolean(v.gemini_key_enc),
    };
  return {
    apiKey: null,
    model,
    source: "none",
    hasDbKey: Boolean(v.gemini_key_enc),
  };
}

export interface NewsDraft {
  title: string;
  body_html: string;
  excerpt: string;
  seo_title: string;
  seo_description: string;
}

/** 以 Gemini 生成一篇新聞草稿（含 SEO 欄位）。 */
export async function generateNewsDraft(
  topic: string,
  category: string,
): Promise<{ draft: NewsDraft; model: string }> {
  const { apiKey, model } = await getAiConfig();
  if (!apiKey) {
    throw new Error(
      "尚未設定 Gemini API key（請至 後台 ▸ 網站設定 貼上，或設定 GEMINI_API_KEY 環境變數）",
    );
  }

  const prompt = `你是「超勁賀空壓科技」的內容編輯。請針對主題「${topic}」（分類：${category}）撰寫一篇繁體中文的官網文章。
要求：內容專業、具體、利於 SEO；不要誇大不實。
body_html 僅能使用 <h2> <h3> <p> <ul> <ol> <li> <strong> <em> 等基本標籤，不可包含 <script>/<style>/inline style/onclick 等。
回傳「純 JSON 物件」，欄位：
- title：文章標題
- body_html：內文 HTML
- excerpt：摘要（不超過 120 字）
- seo_title：SEO 標題（不超過 60 字）
- seo_description：SEO 描述（不超過 155 字）`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.7,
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    // 不回傳含 key 的 url；只回狀態與訊息摘要。
    throw new Error(`Gemini API 失敗（${res.status}）：${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const text: string =
    data?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text ?? "")
      .join("") ?? "";
  let parsed: Partial<NewsDraft>;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Gemini 回傳非 JSON，無法解析");
  }
  const draft: NewsDraft = {
    title: String(parsed.title ?? "").slice(0, 300),
    body_html: String(parsed.body_html ?? ""),
    excerpt: String(parsed.excerpt ?? "").slice(0, 400),
    seo_title: String(parsed.seo_title ?? "").slice(0, 200),
    seo_description: String(parsed.seo_description ?? "").slice(0, 400),
  };
  if (!draft.title || !draft.body_html) {
    throw new Error("Gemini 生成結果缺少 title 或 body_html");
  }
  return { draft, model };
}

const NO_KEY_ERROR =
  "尚未設定 Gemini API key（請至 後台 ▸ 網站設定 貼上，或設定 GEMINI_API_KEY 環境變數）";

/**
 * 帶自動重試 / 指數退避的 Gemini generateContent fetch（不解析文字，回傳 data）。
 * - 暫時性狀態（429/500/503）退避後重試，最多 MAX_ATTEMPTS 次。
 * - 非暫時性狀態（如 400/401/403）立即丟錯。
 * - 退避時間用 backoffMs()；sleep 可注入，方便測試不真的等待。
 * - 錯誤訊息不含 key / url（沿用既有風格）。
 *
 * 抽成可注入 sleep 的（近）純函式，方便單元測試重試迴圈。SERVER ONLY 由呼叫端保證。
 */
export async function fetchGeminiWithRetry(
  url: string,
  body: unknown,
  deps: { sleep?: (ms: number) => Promise<void> } = {},
): Promise<unknown> {
  const doSleep = deps.sleep ?? sleep;
  let lastError: Error = new Error("Gemini API 失敗（未知錯誤）");

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return res.json();

    const text = await res.text();
    lastError = new GeminiHttpError(
      `Gemini API 失敗（${res.status}）：${text.slice(0, 200)}`,
      res.status,
    );
    // 非暫時性錯誤 → 立即失敗，不重試。
    if (!isRetryableStatus(res.status)) throw lastError;
    // 還有下一次嘗試才退避；最後一次失敗直接落到迴圈外丟出。
    if (attempt < MAX_ATTEMPTS) await doSleep(backoffMs(attempt));
  }
  throw lastError;
}

/**
 * 共用：呼叫 Gemini generateContent，回傳合併後的文字輸出。SERVER ONLY。
 * 與 generateNewsDraft 同 fetch / 錯誤處理風格（不回傳含 key 的 url）。
 *
 * 內含重試（fetchGeminiWithRetry）；若用盡重試仍為 503（過載）且非備援模型，
 * 自動以 FALLBACK_MODEL 再試一輪。回傳實際產出結果的 model，供上層回報。
 */
async function callGemini(
  apiKey: string,
  model: string,
  prompt: string,
  opts: { json?: boolean; temperature?: number } = {},
): Promise<{ text: string; model: string }> {
  const generationConfig: Record<string, unknown> = {
    temperature: opts.temperature ?? 0.4,
  };
  if (opts.json) generationConfig.responseMimeType = "application/json";
  const reqBody = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig,
  };

  const buildUrl = (m: string) =>
    `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(apiKey)}`;

  try {
    const data = await fetchGeminiWithRetry(buildUrl(model), reqBody);
    return { text: extractGeminiText(data), model };
  } catch (err) {
    // 用盡重試仍 503（過載）且尚未用備援模型 → 以 flash-lite 再試一輪。
    if (
      err instanceof GeminiHttpError &&
      err.status === 503 &&
      model !== FALLBACK_MODEL
    ) {
      const data = await fetchGeminiWithRetry(
        buildUrl(FALLBACK_MODEL),
        reqBody,
      );
      return { text: extractGeminiText(data), model: FALLBACK_MODEL };
    }
    throw err;
  }
}

/** 從 Gemini 回應抽出合併文字（純函式，便於測試）。 */
export function extractGeminiText(data: unknown): string {
  const candidates = (data as { candidates?: unknown })?.candidates;
  const first = Array.isArray(candidates) ? candidates[0] : undefined;
  const parts = (first as { content?: { parts?: unknown } })?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map((p: { text?: string }) => p?.text ?? "").join("");
}

/**
 * 去除模型常見的 Markdown code fence（```html … ``` / ``` … ```）。
 * 純函式，便於測試。
 */
export function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fence = /^```[a-zA-Z]*\s*\n?([\s\S]*?)\n?```$/;
  const m = trimmed.match(fence);
  return (m ? m[1] : trimmed).trim();
}

/**
 * 修文後處理：去 code fence → 經 sanitizeBodyHtml allowlist 消毒。
 * 抽成純函式，確保「AI 產出必過 sanitize」這條規則可被單元測試覆蓋。
 */
export function postProcessRefinedHtml(raw: string): string {
  return sanitizeBodyHtml(stripCodeFence(raw));
}

/**
 * AI 修文：修正錯字 / 語法、補完內容，輸出乾淨 HTML。
 * 回傳前一律經 sanitizeBodyHtml() allowlist 消毒（防 stored XSS，不信任模型輸出）。
 * SERVER ONLY；使用後台可編輯的 fix_article prompt。
 */
export async function refineArticleHtml(
  html: string,
): Promise<{ html: string; model: string }> {
  const { apiKey, model } = await getAiConfig();
  if (!apiKey) throw new Error(NO_KEY_ERROR);

  const source = (html ?? "").trim();
  if (!source) throw new Error("沒有可修潤的內文");

  const { fix_article } = await getAiPrompts();
  const prompt = `${fix_article}\n\n---\n以下是要修潤的文章 HTML：\n${source}`;

  const { text, model: usedModel } = await callGemini(apiKey, model, prompt, {
    temperature: 0.4,
  });
  const clean = postProcessRefinedHtml(text);
  if (!clean) throw new Error("Gemini 未回傳可用的內文");
  return { html: clean, model: usedModel };
}

/**
 * 依摘要生成內文：把摘要（excerpt，必要時參考標題）擴寫成完整內文 HTML。
 * 回傳前一律經 postProcessRefinedHtml()（去 code fence + sanitizeBodyHtml allowlist 消毒，
 * 防 stored XSS，不信任模型輸出）。
 * SERVER ONLY；使用後台可編輯的 gen_body prompt。
 */
export async function generateBodyFromExcerpt(input: {
  excerpt: string;
  title?: string;
}): Promise<{ html: string; model: string }> {
  const { apiKey, model } = await getAiConfig();
  if (!apiKey) throw new Error(NO_KEY_ERROR);

  const excerpt = (input.excerpt ?? "").trim();
  if (!excerpt) throw new Error("沒有可生成的摘要");
  const title = (input.title ?? "").trim();

  const { gen_body } = await getAiPrompts();
  const prompt = `${gen_body}\n\n---\n標題：${title || "（無）"}\n\n摘要：\n${excerpt}`;

  const { text, model: usedModel } = await callGemini(apiKey, model, prompt, {
    temperature: 0.6,
  });
  const clean = postProcessRefinedHtml(text);
  if (!clean) throw new Error("Gemini 未回傳可用的內文");
  return { html: clean, model: usedModel };
}

export interface SeoSuggestion {
  seo_title: string;
  seo_description: string;
  og_title: string;
  og_description: string;
  slug: string;
  /** schema.org JSON-LD 物件；無則 null。 */
  jsonld: Record<string, unknown> | null;
}

/** slug 正規化：小寫、僅留 a-z0-9 與連字號、收斂多餘連字號。純函式，便於測試。 */
export function normaliseSlug(input: unknown): string {
  return String(input ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

/**
 * 把模型回傳的 JSON 文字整形成 SeoSuggestion（容錯 + 長度截斷）。
 * 純函式，便於測試；解析失敗丟錯。
 */
export function shapeSeoResult(text: string): SeoSuggestion {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(stripCodeFence(text));
  } catch {
    throw new Error("Gemini 回傳非 JSON，無法解析");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Gemini 回傳格式錯誤");
  }

  const s = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
  const seoTitle = s(parsed.seo_title).slice(0, 200);
  const seoDescription = s(parsed.seo_description).slice(0, 400);

  let jsonld: Record<string, unknown> | null = null;
  const rawJsonld = parsed.jsonld;
  if (rawJsonld && typeof rawJsonld === "object" && !Array.isArray(rawJsonld)) {
    jsonld = rawJsonld as Record<string, unknown>;
  }

  return {
    seo_title: seoTitle,
    seo_description: seoDescription,
    // og_* 缺時沿用 seo_*（與前台 buildSeoMetadata 的 fallback 行為一致）。
    og_title: s(parsed.og_title).slice(0, 200) || seoTitle,
    og_description: s(parsed.og_description).slice(0, 400) || seoDescription,
    slug: normaliseSlug(parsed.slug),
    jsonld,
  };
}

/**
 * 一鍵填 SEO：依標題 / 內文產生 SEO meta 建議。
 * SERVER ONLY；使用後台可編輯的 fill_seo prompt。
 */
export async function fillSeoFromContent(input: {
  title?: string;
  html?: string;
  text?: string;
}): Promise<{ seo: SeoSuggestion; model: string }> {
  const { apiKey, model } = await getAiConfig();
  if (!apiKey) throw new Error(NO_KEY_ERROR);

  const title = (input.title ?? "").trim();
  // 內文來源：純文字優先，否則用 HTML（模型可自行忽略標籤）。
  const body = (input.text ?? input.html ?? "").trim();
  if (!title && !body) throw new Error("沒有可分析的標題或內文");

  const { fill_seo } = await getAiPrompts();
  const prompt = `${fill_seo}\n\n---\n標題：${title || "（無）"}\n\n內文：\n${body || "（無）"}`;

  const { text, model: usedModel } = await callGemini(apiKey, model, prompt, {
    json: true,
    temperature: 0.5,
  });
  return { seo: shapeSeoResult(text), model: usedModel };
}

/**
 * 以 Gemini vision 從「男生卡」照片擷取保養資料，回傳原始 JSON 物件。
 * imageBase64 為不含 data: 前綴的 base64；mimeType 例 "image/jpeg"。
 * 解析/清洗交給 lib/admin/maintenance-normalize.parseExtraction。
 */
export async function extractMaintenanceCard(
  imageBase64: string,
  mimeType: string,
): Promise<{ raw: unknown; model: string }> {
  const { apiKey, model } = await getAiConfig();
  if (!apiKey) throw new Error(NO_KEY_ERROR);

  const prompt = `你是資料輸入助理。這是一張手寫的「空壓機保養記錄卡」照片(繁體中文 + 數字)。
請擷取內容並回傳「純 JSON 物件」，格式：
{
  "basic": {
    "customer_name": "客戶名稱", "customer_code": "客戶編號(卡片左上代號，如KC054)",
    "serial_no": "機號", "machine_no": "機台編號(若卡上有)",
    "location": "使用地點", "purchased_at": "購買時間(YYYY-MM-DD)",
    "model": "機型", "horsepower": "馬力", "voltage": "電壓"
  },
  "records": [
    { "service_date": "日期(YYYY-MM-DD)", "hours": "時數", "oil": "專用油",
      "oil_filter": "機油濾清器", "air_filter": "空氣濾清器", "oil_separator": "油氣分離器",
      "inverter": "變頻器", "filter_system": "過濾系統", "technician": "維護員", "note": "備註" }
  ]
}

【民國年轉換 — 重要】卡片上的年份是「民國(ROC)紀年」，換算西元 = 民國年 + 1911。
- 例：「112.4.20」→ 2023-04-20；「115.5.23」→ 2026-05-23。
- 購買時間常只有「年/月」(如「購買112/04」)：換算後補該月 01 日 → 2023-04-01。
- 只要判斷得出年份就務必輸出，不要因為缺日而留空。

【表格對欄 — 非常重要，請嚴格遵守】維護表的欄位由左到右固定為這 9 欄：
  日期 → 時數 → 專用油 → 機油濾清器 → 空氣濾清器 → 油氣分離器 → 變頻器 → 過濾系統 → 維護員
注意「機油濾清器 / 空氣濾清器 / 油氣分離器」的表頭是兩行字、欄位較窄，容易數錯欄。
- 判斷每個手寫記號屬於哪一欄，一律「以該記號的水平位置對準表頭欄位」為準，不可整列左右平移。
- 某一格是空白就在對應欄位填 ""，不要把右邊的值往左借、也不要把左邊的值往右推。
- 記號如「例 / 1 / ✓ / ○ / │」代表該項有更換或保養，原樣填入「它所在的那一欄」。
- 若某段手寫文字(如「顯示電壓過低已排除」「研磨耗損…下次留意」)明顯是跨欄的整段註記、不屬於某個濾清器欄位，請放到 "note"(備註)，不要硬塞進某個濾清器/過濾系統欄。
- 時數手寫常上下疊兩個數字(例上面 83、下面 42)，下方數字通常是累計時數，取較完整的那個填入 hours。

其他規則：
- 看不清楚或確實空白的欄位回空字串 ""，絕不猜測或編造內容。
- records 逐列輸出(表格每一橫列一筆)，保留原始由上到下順序；表格下方整片空白列不要輸出。
- 卡片上方的「送500小時一次保養」「B」等註記屬背景資訊，不是維護列，勿當成一列。`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [
      {
        parts: [
          { text: prompt },
          { inlineData: { mimeType, data: imageBase64 } },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1,
    },
  };

  const data = await fetchGeminiWithRetry(url, body);
  const text = extractGeminiText(data);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("辨識結果非 JSON，無法解析，請改用手動輸入。");
  }
  return { raw, model };
}
