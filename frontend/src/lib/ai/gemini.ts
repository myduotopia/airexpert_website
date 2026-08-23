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
// 保養卡辨識（手寫稀疏表格、對欄難）獨立用較強的 2.5 Pro，不動設定頁其他 AI 功能的模型。
const EXTRACT_MODEL = "gemini-2.5-pro";
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
  focus?: string;
}): Promise<{ seo: SeoSuggestion; model: string }> {
  const { apiKey, model } = await getAiConfig();
  if (!apiKey) throw new Error(NO_KEY_ERROR);

  const title = (input.title ?? "").trim();
  // 內文來源：純文字優先，否則用 HTML（模型可自行忽略標籤）。
  const body = (input.text ?? input.html ?? "").trim();
  if (!title && !body) throw new Error("沒有可分析的標題或內文");
  // 選填的重點關鍵字／提示（上限 100 字）；空字串時行為與過往完全一致。
  const focus = (input.focus ?? "").trim().slice(0, 100);

  const { fill_seo } = await getAiPrompts();
  const focusBlock = focus
    ? `\n\n重點關鍵字／提示（請以此為主要優化方向，約佔 60% 權重；其餘約 40% 依標題與內文。務必通順、符合搜尋意圖，不得關鍵字堆砌或誇大不實）：\n${focus}`
    : "";
  const prompt = `${fill_seo}\n\n---\n標題：${title || "（無）"}\n\n內文：\n${body || "（無）"}${focusBlock}`;

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
  const { apiKey } = await getAiConfig();
  if (!apiKey) throw new Error(NO_KEY_ERROR);
  // 辨識固定用 EXTRACT_MODEL（2.5 Pro），不吃設定頁的 model。
  const model = EXTRACT_MODEL;

  const prompt = `你是資料輸入助理。這是一張手寫的「空壓機保養記錄卡」照片(繁體中文 + 數字)。
請擷取內容並回傳「純 JSON 物件」，格式：
{
  "card_kind": "compressor | filter | mixed",
  "basic": {
    "customer_name": "客戶名稱", "customer_code": "客戶編號(卡片左上代號，如KC054)",
    "serial_no": "機號", "machine_no": "機台編號(若卡上有)",
    "location": "使用地點", "purchased_at": "購買時間(YYYY-MM-DD)",
    "model": "機型", "horsepower": "馬力", "voltage": "電壓",
    "filter_spec": "表頭的過濾系統型號原文：『過濾 …』或行尾的『＋100HA』，沒有就空字串"
  },
  "records": [
    { "service_date": "日期(YYYY-MM-DD)", "hours": "時數", "oil": "專用油",
      "oil_filter": "機油濾清器", "air_filter": "空氣濾清器", "oil_separator": "油氣分離器",
      "inverter": "變頻器", "filter_system": "過濾系統", "technician": "維護員", "note": "備註",
      "service_type": "inspection|maintenance|repair 或空字串",
      "belongs_to": "compressor | filter" }
  ]
}

【卡別分流 — 舊資料常把「過濾系統(乾燥機)卡」與「空壓機卡」混寫在同一張紙上】
紙張標題一律印「空壓機保養紀錄卡」，但實際內容不一定只有空壓機，請先判斷 card_kind：
- 機號那一行（或緊接使用地點的下一行）若「以『過濾』二字開頭」，例「過濾 AL 010N + LM-P-010」
  → card_kind = "filter"；把該整串原文(含「過濾」二字)填入 basic.filter_spec，
    basic.serial_no 留空 ""（這張紙沒有空壓機機號）。
- 表頭同時出現「機號XXX」與「過濾XXX」，例「機號J751307001 過濾100HA」
  → card_kind = "mixed"；serial_no 填 "J751307001"、filter_spec 填 "過濾100HA"。
- 機型 / 馬力 / 電壓那一行（或機號那一行）的「結尾」另外手寫「＋100HA」「+100HA」這種
  「加號 + 型號」的註記，意思等同「過濾100HA」，也是過濾系統(乾燥機)的型號
  → 有機號時 card_kind = "mixed"；filter_spec 填含加號的原文如 "＋100HA"。
    這段註記不要一併塞進 model / horsepower / voltage（電壓只填 "380V"）。
- 表頭既沒有「過濾」二字、也沒有上述加號註記 → card_kind = "compressor"，filter_spec 填 ""。
  「機型JNV75/8」「12"馬達+葉片」這種加號後面接中文、或本來就在型號中間的加號不算註記。
- filter_spec 只能來自表頭 / 機號欄的原文，絕不可從表格內文湊出來。

【每一列的歸屬 belongs_to】
- 內容主要落在「過濾系統」欄（或由該欄溢寫到右邊的「變頻器」欄），
  或提到 乾燥機／乾修／排水器／濾蕊／散熱馬達／葉片／AD480／CKD → belongs_to = "filter"。
- 「散熱器組清洗」「散熱器清潔」講的是空壓機本體的散熱器，不是乾燥機 → belongs_to = "compressor"。
- 有時數／專用油／機油濾清器／空氣濾清器／油氣分離器的值 → belongs_to = "compressor"。
- 同一列若兩張卡的內容都有（例：專用油寫「例」、過濾系統欄寫「乾燥機12"散熱馬達+葉片」）
  → 拆成「兩列」輸出，各自只保留屬於自己那張卡的欄位值，日期 / 維護員 兩列都填，
    再各自標上 belongs_to。
- card_kind = "compressor" 時，所有列一律 belongs_to = "compressor"。

【民國年轉換 — 重要】卡片上的年份是「民國(ROC)紀年」，換算西元 = 民國年 + 1911。
- 例：「112.4.20」→ 2023-04-20；「115.5.23」→ 2026-05-23。
- 購買時間常只有「年/月」(如「購買112/04」)：換算後補該月 01 日 → 2023-04-01。
- 只要判斷得出年份就務必輸出，不要因為缺日而留空。

【服務類型 service_type — 三選一互斥，依下列「優先順序」判定（順序即為 if / else-if）】
1. 例檢 inspection —「專用油」欄辨識到「例」（含「例.」「例行」等變形）。
2. 保養 maintenance — 否則，若耗材欄（專用油／機油濾清器／空氣濾清器／油氣分離器）
   直接寫了耗材數量（例：機油濾清器底下的格子寫「1」）。耗材數量一律是個位數 1~9
   （或 x1／×1）；若該格是兩位以上的數字，那幾乎一定是「時數」欄對欄偏移掉進來的，
   不算耗材數量 → 不可判成保養。
3. 維修 repair — 否則，若寫上其他耗材名稱與數量（通常是自由文字，例：「油鏡×1只」
   「散熱器組清潔」「彈性元件×1／回油視窗×1」「乾燥機12"散熱馬達+葉片」）。
   只有數字（不論幾位數）而沒有文字的格子不算自由文字，不可因此判成維修。
判不出來就回空字串 ""，不要猜。注意「保養優先於維修」：同一列既有耗材數量、變頻器欄
又有自由文字時，一律歸「保養 maintenance」。「NA」「N/A」代表不適用／該次沒做，
視同空白格，不可因此判成維修。

【表格對欄 — 非常重要，請嚴格遵守】維護表的欄位由左到右固定為這 9 欄：
  日期 → 時數 → 專用油 → 機油濾清器 → 空氣濾清器 → 油氣分離器 → 變頻器 → 過濾系統 → 維護員
注意「機油濾清器 / 空氣濾清器 / 油氣分離器」的表頭是兩行字、欄位較窄，容易數錯欄。
- 判斷每個手寫記號屬於哪一欄，一律「以該記號的水平位置對準表頭欄位」為準，不可整列左右平移。
- 某一格是空白就在對應欄位填 ""，不要把右邊的值往左借、也不要把左邊的值往右推。

【手寫符號語彙 — 請照此解讀】
- 「例」= 例行更換（該項已更換），填「例」。
- 「1」「/」「✓」「○」「│」= 該項已做/已更換，原樣填入它所在的那一欄。
- 「〃」「"」「”」「同上」= 與「上一列同一欄」的內容相同 → 請「複製上一列該欄的值」填入，不要填符號本身。
- 「NA」「N/A」= 不適用 / 該次未做該項，填「NA」。
- 記號一律填在「它水平對到的那一欄」，不要挪欄。

【時數欄】時數格常上下疊兩個數字（如上面小字「83 / NA」、下面「3474」）：
- 下方（較大、較完整）的數字是「時數讀值」→ 填入 hours（例 3474、18760）。
- 上方小字多為月份 / 代號，不是時數，忽略或不填。

【備註歸屬】若某段手寫文字（如「沒在用」「未開」「桶下排水堵塞已處理」「顯示電壓過低已排除」「油濾至轉子油管×1件」）是跨欄的整段敘述、不屬於某個濾清器/系統欄位，請放到該列的 "note"(備註)，不要硬塞進濾清器 / 過濾系統欄。

其他規則：
- 看不清楚或確實空白的欄位回空字串 ""，絕不猜測或編造內容。
- records 逐列輸出(表格每一橫列一筆)，保留原始由上到下順序；表格下方整片空白列不要輸出。
- 卡片上方的「送500小時一次保養」「B」「過濾 …」等註記屬背景資訊，不是維護列，勿當成一列。`;

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
  const buildUrl = (m: string) =>
    `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(apiKey)}`;

  // 優先用 2.5 Pro；若 Pro 不可用（配額 / 權限 / 過載用盡重試）則退回 2.5 Flash，
  // 避免辨識因 Pro 問題整個失敗。實際產出的 model 一併回傳供稽核。
  let data: unknown;
  let usedModel = model;
  try {
    data = await fetchGeminiWithRetry(buildUrl(model), body);
  } catch {
    usedModel = DEFAULT_MODEL;
    data = await fetchGeminiWithRetry(buildUrl(DEFAULT_MODEL), body);
  }
  const text = extractGeminiText(data);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("辨識結果非 JSON，無法解析，請改用手動輸入。");
  }
  return { raw, model: usedModel };
}
