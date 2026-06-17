// Gemini（Google AI Studio）內容生成 — SERVER ONLY。
// API key 來源順序：後台設定（site_settings.ai_config，AES 解密）▸ GEMINI_API_KEY env。
// key 只在 server 端使用，絕不送瀏覽器。
import "server-only";

import { getAdminSupabase } from "../supabase-admin";
import { decryptSecret } from "../crypto";

export const AI_CONFIG_KEY = "ai_config";
const DEFAULT_MODEL = "gemini-2.0-flash";

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
