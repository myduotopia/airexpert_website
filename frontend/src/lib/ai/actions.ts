"use server";

// 共用 AI server actions（修文 / 一鍵填 SEO），供五區編輯頁與未來的 SEO 總覽頁（V3-4）共用。
// key 只在 server 端使用；產出回前端供編輯者審核後再寫入欄位。
// 產出同時寫入 ai_content_drafts（沿用 news/ai 的草稿紀錄模式）作為稽核軌跡。

import { requireAdmin, requireRole } from "@/lib/admin/auth";
import { getAdminSupabase } from "@/lib/supabase-admin";
import {
  refineArticleHtml,
  generateBodyFromExcerpt,
  fillSeoFromContent,
  type SeoSuggestion,
} from "@/lib/ai/gemini";

/** ai_content_drafts.target_type 允許值（對應五區內容）。 */
export type AiTargetType = "product" | "article" | "case" | "service" | "album";

async function recordDraft(args: {
  targetType: string;
  targetId?: string | null;
  kind: string;
  prompt: string;
  model: string;
  output: string;
}): Promise<void> {
  // 草稿紀錄失敗不應阻擋 AI 結果回傳給編輯者，故吞錯（best-effort 稽核）。
  await getAdminSupabase()
    .from("ai_content_drafts")
    .insert({
      target_type: args.targetType,
      target_id: args.targetId ?? null,
      kind: args.kind,
      prompt: args.prompt,
      model: args.model,
      output: args.output,
      status: "pending",
    });
}

export type RefineBodyResult =
  | { ok: true; html: string }
  | { ok: false; error: string };

/**
 * AI 修文 — 編輯文章內文 → ADMIN ONLY（代管 seo_manager 不可改內文）。
 * 回傳消毒後 HTML 供編輯者審核後填回欄位（不直接寫 DB）。
 */
export async function refineBodyHtmlAction(
  html: string,
  meta: { targetType?: AiTargetType; targetId?: string | null } = {},
): Promise<RefineBodyResult> {
  await requireAdmin();
  try {
    const { html: clean, model } = await refineArticleHtml(html);
    await recordDraft({
      targetType: meta.targetType ?? "article",
      targetId: meta.targetId ?? null,
      kind: "body",
      prompt: "refine_article",
      model,
      output: clean,
    });
    return { ok: true, html: clean };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export type GenerateBodyResult =
  | { ok: true; html: string }
  | { ok: false; error: string };

/**
 * 依摘要生成內文 — 編輯文章內文 → ADMIN ONLY（與 AI 修文同權限）。
 * 回傳消毒後 HTML 供編輯者審核後填回內文欄位（不直接寫 DB）。
 */
export async function generateBodyFromExcerptAction(
  input: { excerpt: string; title?: string },
  meta: { targetType?: AiTargetType; targetId?: string | null } = {},
): Promise<GenerateBodyResult> {
  await requireAdmin();
  try {
    const { html, model } = await generateBodyFromExcerpt(input);
    await recordDraft({
      targetType: meta.targetType ?? "article",
      targetId: meta.targetId ?? null,
      kind: "body",
      prompt: "gen_body",
      model,
      output: html,
    });
    return { ok: true, html };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export type FillSeoResult =
  | { ok: true; seo: SeoSuggestion }
  | { ok: false; error: string };

/**
 * 一鍵填 SEO — admin 與 SEO 代管皆可（代管的核心工作）。
 * 回傳 SEO 建議供前端填入 SeoFields 欄位（不直接寫 DB）。
 * 設計為可被未來的統一 SEO 總覽頁（V3-4）直接 import。
 */
export async function fillSeoFromContentAction(
  input: { title?: string; html?: string; text?: string },
  meta: { targetType?: AiTargetType; targetId?: string | null } = {},
): Promise<FillSeoResult> {
  await requireRole(["admin", "seo_manager"]);
  try {
    const { seo, model } = await fillSeoFromContent(input);
    await recordDraft({
      targetType: meta.targetType ?? "article",
      targetId: meta.targetId ?? null,
      kind: "seo",
      prompt: "fill_seo",
      model,
      output: JSON.stringify(seo),
    });
    return { ok: true, seo };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
