import Link from "next/link";
import { getAdminSupabase } from "@/lib/supabase-admin";
import {
  ReorderableTable,
  type ReorderColumn,
} from "@/components/admin/ReorderableTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { formatNewsDate } from "@/components/news/format";
import { deleteArticle, reorderNewsAction } from "./actions";
import type { Article } from "@/lib/types";

export const metadata = { title: "最新消息 — 後台" };

// 後台讀全部文章（含草稿/封存），故走 service_role admin client 而非公開 data layer。
async function getAllArticles(): Promise<Article[]> {
  const { data, error } = await getAdminSupabase()
    .from("articles")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("published_at", { ascending: false, nullsFirst: true });
  if (error) throw new Error(`讀取文章失敗：${error.message}`);
  return (data ?? []) as Article[];
}

export default async function AdminNewsPage() {
  const articles = await getAllArticles();

  // ReorderableTable 是 client component，cells 須由 server 端預先渲染成可序列化的 ReactNode。
  const columns: ReorderColumn[] = [
    { header: "標題" },
    { header: "分類" },
    { header: "發佈時間" },
    { header: "狀態" },
    { header: "", className: "text-right" },
  ];

  const rows = articles.map((a) => ({
    key: a.id,
    cells: [
      <Link
        href={`/admin/news/${a.id}/edit`}
        className="text-ink hover:text-primary-deep font-medium"
        key="title"
      >
        {a.title}
      </Link>,
      a.category,
      <span className="font-mono text-[13px]" key="date">
        {formatNewsDate(a.published_at) || "—"}
      </span>,
      <StatusBadge status={a.status} key="status" />,
      <span className="inline-flex items-center gap-1" key="ops">
        <Link
          href={`/admin/news/${a.id}/edit`}
          className="text-primary-deep hover:bg-surface-muted inline-flex h-9 items-center rounded-md px-3 text-[13px] font-medium"
        >
          編輯
        </Link>
        <DeleteButton onDelete={deleteArticle.bind(null, a.id)} />
      </span>,
    ],
  }));

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
        <ReorderableTable
          rows={rows}
          columns={columns}
          onReorder={reorderNewsAction}
          empty="尚無文章，點右上角「新增文章」開始建立。"
        />
      </div>
    </div>
  );
}
