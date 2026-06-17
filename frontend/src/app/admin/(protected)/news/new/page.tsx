import Link from "next/link";
import {
  ArticleForm,
  type ArticlePrefill,
} from "@/components/news/admin/ArticleForm";
import { createArticle } from "../actions";
import { getAdminSupabase } from "@/lib/supabase-admin";

export const metadata = { title: "新增文章 — 後台" };

async function loadDraft(id: string): Promise<ArticlePrefill | undefined> {
  const { data } = await getAdminSupabase()
    .from("ai_content_drafts")
    .select("output")
    .eq("id", id)
    .maybeSingle();
  if (!data?.output) return undefined;
  try {
    const d = JSON.parse(data.output as string);
    return {
      title: d.title,
      category: d.category,
      excerpt: d.excerpt,
      body_html: d.body_html,
      seo_title: d.seo_title,
      seo_description: d.seo_description,
    };
  } catch {
    return undefined;
  }
}

export default async function NewArticlePage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string }>;
}) {
  const { draft } = await searchParams;
  const prefill = draft ? await loadDraft(draft) : undefined;

  return (
    <div className="mx-auto max-w-[1000px]">
      <Link
        href="/admin/news"
        className="text-text-muted hover:text-primary-deep text-[14px]"
      >
        ← 返回列表
      </Link>
      <h1 className="text-ink mt-2 text-[24px] font-bold">新增文章</h1>
      {prefill ? (
        <p className="border-primary/30 bg-primary/5 text-primary-deep mt-3 rounded-lg border px-3 py-2 text-[13px]">
          ✨ 已帶入 AI 生成草稿，請審稿、補上 slug 與發佈時間後再儲存。
        </p>
      ) : null}
      <div className="mt-6">
        <ArticleForm action={createArticle} prefill={prefill} />
      </div>
    </div>
  );
}
