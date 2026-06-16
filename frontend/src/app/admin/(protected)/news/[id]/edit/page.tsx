import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminSupabase } from "@/lib/supabase-admin";
import { ArticleForm } from "@/components/news/admin/ArticleForm";
import { updateArticle } from "../../actions";
import type { Article } from "@/lib/types";

export const metadata = { title: "編輯文章 — 後台" };

type EditPageProps = { params: Promise<{ id: string }> };

async function getArticleById(id: string): Promise<Article | null> {
  const { data, error } = await getAdminSupabase()
    .from("articles")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`讀取文章失敗：${error.message}`);
  return (data as Article | null) ?? null;
}

export default async function EditArticlePage(props: EditPageProps) {
  const { id } = await props.params;
  const article = await getArticleById(id);
  if (!article) notFound();

  // 以 article.id bind updateArticle，得到 (prev, fd) 簽章的 server action，
  // 可安全跨 server→client 邊界傳給 ArticleForm。
  const action = updateArticle.bind(null, article.id);

  return (
    <div className="mx-auto max-w-[1000px]">
      <Link
        href="/admin/news"
        className="text-text-muted hover:text-primary-deep text-[14px]"
      >
        ← 返回列表
      </Link>
      <h1 className="text-ink mt-2 text-[24px] font-bold">編輯文章</h1>
      <div className="mt-6">
        <ArticleForm action={action} article={article} />
      </div>
    </div>
  );
}
