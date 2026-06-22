import Link from "next/link";
import { getAdminSupabase } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/admin/auth";
import type { Event, PhotoAlbum } from "@/lib/types";
import { DataTable, type Column } from "@/components/admin/DataTable";
import {
  ReorderableTable,
  type ReorderColumn,
} from "@/components/admin/ReorderableTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { deleteEvent, deleteAlbum, reorderEventsAction } from "./actions";

export const metadata = { title: "公司活動管理" };

// 後台讀「全部」（含 draft / archived），故用 admin client 繞過 RLS。
async function getAllEvents(): Promise<Event[]> {
  const { data, error } = await getAdminSupabase()
    .from("events")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("event_date", { ascending: false, nullsFirst: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Event[];
}

async function getAllAlbums(): Promise<PhotoAlbum[]> {
  const { data, error } = await getAdminSupabase()
    .from("photo_albums")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as PhotoAlbum[];
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

export default async function AdminEventsPage() {
  await requireAdmin();
  const [events, albums] = await Promise.all([getAllEvents(), getAllAlbums()]);

  // ReorderableTable 是 client component，cells 須由 server 端預先渲染成可序列化的 ReactNode。
  const eventColumns: ReorderColumn[] = [
    { header: "標題" },
    { header: "影片" },
    { header: "活動日期" },
    { header: "狀態" },
    { header: "操作", className: "text-right" },
  ];

  const eventRows = events.map((e) => ({
    key: e.id,
    cells: [
      <Link
        href={`/admin/events/videos/${e.id}`}
        className="text-primary-deep font-medium hover:underline"
        key="title"
      >
        {e.title}
      </Link>,
      e.video_url ? (
        <span className="text-text-muted font-mono text-[12px]" key="video">
          有
        </span>
      ) : (
        <span className="text-text-muted text-[12px]" key="video">
          —
        </span>
      ),
      formatDate(e.event_date),
      <StatusBadge status={e.status} key="status" />,
      <span className="inline-flex items-center gap-1" key="ops">
        <Link
          href={`/admin/events/videos/${e.id}`}
          className="hover:bg-surface-muted inline-flex h-9 items-center rounded-md px-3 text-[13px] font-medium"
        >
          編輯
        </Link>
        <DeleteButton onDelete={deleteEvent.bind(null, e.id)} />
      </span>,
    ],
  }));

  const albumColumns: Column<PhotoAlbum>[] = [
    {
      header: "標題",
      cell: (a) => (
        <Link
          href={`/admin/events/albums/${a.id}`}
          className="text-primary-deep font-medium hover:underline"
        >
          {a.title}
        </Link>
      ),
    },
    {
      header: "Slug",
      cell: (a) => <span className="font-mono text-[13px]">{a.slug}</span>,
    },
    { header: "狀態", cell: (a) => <StatusBadge status={a.status} /> },
    {
      header: "操作",
      className: "text-right",
      cell: (a) => (
        <span className="inline-flex items-center gap-1">
          <Link
            href={`/admin/events/albums/${a.id}`}
            className="hover:bg-surface-muted inline-flex h-9 items-center rounded-md px-3 text-[13px] font-medium"
          >
            編輯
          </Link>
          <DeleteButton onDelete={deleteAlbum.bind(null, a.id)} />
        </span>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1000px]">
      <div>
        <h1 className="text-ink text-[24px] font-bold">公司活動</h1>
        <p className="text-text-muted mt-1 text-[15px]">
          管理交機影片（YouTube）與活動花絮相簿。
        </p>
      </div>

      {/* 交機影片 */}
      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-ink text-[18px] font-semibold">交機影片</h2>
          <Link
            href="/admin/events/videos/new"
            className="bg-primary hover:bg-primary-deep inline-flex h-10 items-center rounded-lg px-4 text-[14px] font-semibold text-white transition-colors"
          >
            新增影片
          </Link>
        </div>
        <div className="mt-4">
          <ReorderableTable
            rows={eventRows}
            columns={eventColumns}
            onReorder={reorderEventsAction}
            empty="尚無影片，點右上角「新增影片」建立。"
          />
        </div>
      </section>

      {/* 活動相簿 */}
      <section className="mt-12">
        <div className="flex items-center justify-between">
          <h2 className="text-ink text-[18px] font-semibold">活動花絮相簿</h2>
          <Link
            href="/admin/events/albums/new"
            className="bg-primary hover:bg-primary-deep inline-flex h-10 items-center rounded-lg px-4 text-[14px] font-semibold text-white transition-colors"
          >
            新增相簿
          </Link>
        </div>
        <div className="mt-4">
          <DataTable
            rows={albums}
            columns={albumColumns}
            getKey={(a) => a.id}
            empty="尚無相簿，點右上角「新增相簿」建立。"
          />
        </div>
      </section>
    </div>
  );
}
