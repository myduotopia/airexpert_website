import Link from "next/link";
import { ArticleForm } from "@/components/news/admin/ArticleForm";
import { createArticle } from "../actions";

export const metadata = { title: "新增文章 — 後台" };

export default function NewArticlePage() {
  return (
    <div className="mx-auto max-w-[1000px]">
      <Link
        href="/admin/news"
        className="text-text-muted hover:text-primary-deep text-[14px]"
      >
        ← 返回列表
      </Link>
      <h1 className="text-ink mt-2 text-[24px] font-bold">新增文章</h1>
      <div className="mt-6">
        <ArticleForm action={createArticle} />
      </div>
    </div>
  );
}
