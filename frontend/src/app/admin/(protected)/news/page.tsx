import Link from "next/link";
import { getAdminSupabase } from "@/lib/supabase-admin";
import { DataTable } from "@/components/admin/DataTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { formatNewsDate } from "@/components/news/format";
import { deleteArticle } from "./actions";
import type { Article } from "@/lib/types";

export const metadata = { title: "最新消息 — 後台" };

// 後台讀全部文章（含草稿/封存），故走 service_role admin client 而非公開 data layer。
async function getAllArticles(): Promise<Article[]> {
  const { data, error } = await getAdminSupabase()
    .from("articles")
    .select("*")
    .order("published_at", { ascending: false, nullsFirst: true })
    .order("created_at", { ascending: false });
  if (error) throw new Error(`讀取文章失敗：${error.message}`);
  return (data ?? []) as Article[];
}

export default async function AdminNewsPage() {
  const articles = await getAllArticles();

  return (
    <div className="mx-auto max-w-[1000px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-ink text-[24px] font-bold">最新消息</h1>
          <p className="text-text-muted mt-1 text-[15px]">
            共 {articles.length} 篇文章。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/news/ai"
            className="border-border text-primary-deep hover:bg-surface-muted inline-flex h-10 items-center rounded-lg border px-4 text-[14px] font-semibold transition-colors"
          >
            ✨ AI 生成
          </Link>
          <Link
            href="/admin/news/new"
            className="bg-primary hover:bg-primary-deep inline-flex h-10 items-center rounded-lg px-4 text-[14px] font-semibold text-white transition-colors"
          >
            新增文章
          </Link>
        </div>
      </div>

      <div className="mt-6">
        <DataTable
          rows={articles}
          getKey={(a) => a.id}
          empty="尚無文章，點右上角「新增文章」開始建立。"
          columns={[
            {
              header: "標題",
              cell: (a) => (
                <Link
                  href={`/admin/news/${a.id}/edit`}
                  className="text-ink hover:text-primary-deep font-medium"
                >
                  {a.title}
                </Link>
              ),
            },
            { header: "分類", cell: (a) => a.category },
            {
              header: "發佈時間",
              cell: (a) => (
                <span className="font-mono text-[13px]">
                  {formatNewsDate(a.published_at) || "—"}
                </span>
              ),
            },
            { header: "狀態", cell: (a) => <StatusBadge status={a.status} /> },
            {
              header: "",
              className: "text-right",
              cell: (a) => (
                <span className="inline-flex items-center gap-1">
                  <Link
                    href={`/admin/news/${a.id}/edit`}
                    className="text-primary-deep hover:bg-surface-muted inline-flex h-9 items-center rounded-md px-3 text-[13px] font-medium"
                  >
                    編輯
                  </Link>
                  <DeleteButton onDelete={deleteArticle.bind(null, a.id)} />
                </span>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
