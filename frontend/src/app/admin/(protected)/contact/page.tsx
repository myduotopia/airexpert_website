import { requireAdmin } from "@/lib/admin/auth";
import { getAdminSupabase } from "@/lib/supabase-admin";
import { DataTable } from "@/components/admin/DataTable";
import {
  CONTACT_INFO_KEY,
  CONTACT_INFO_DEFAULT,
} from "@/lib/data/contact-info";
import type { ContactSubmission } from "@/lib/types";
import { ContactInfoForm } from "./ContactInfoForm";

export const metadata = { title: "聯絡來信 — 後台" };

// 後台讀全部來信，故走 service_role admin client（RLS 已允許 admin 讀 contact_submissions）。
// 依 created_at 由新到舊排序。
async function getSubmissions(): Promise<ContactSubmission[]> {
  const { data, error } = await getAdminSupabase()
    .from("contact_submissions")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`讀取聯絡來信失敗：${error.message}`);
  return (data ?? []) as ContactSubmission[];
}

// 讀目前的 contact_info 設定（service_role，含尚未公開 / 尚未建立的 key）。
async function getContactInfoRaw(): Promise<unknown> {
  const { data } = await getAdminSupabase()
    .from("site_settings")
    .select("value")
    .eq("key", CONTACT_INFO_KEY)
    .maybeSingle();
  return data?.value ?? null;
}

const DATE_FMT = new Intl.DateTimeFormat("zh-TW", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Taipei",
});

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : DATE_FMT.format(d);
}

export default async function AdminContactPage() {
  await requireAdmin();

  const [submissions, infoRaw] = await Promise.all([
    getSubmissions(),
    getContactInfoRaw(),
  ]);

  const infoValue = infoRaw ?? CONTACT_INFO_DEFAULT;

  return (
    <div className="mx-auto max-w-[1000px]">
      <div>
        <h1 className="text-ink text-[24px] font-bold">聯絡來信</h1>
        <p className="text-text-muted mt-1 text-[15px]">
          共 {submissions.length} 筆來信。
        </p>
      </div>

      {/* 來信列表 */}
      <div className="mt-6">
        <DataTable
          rows={submissions}
          getKey={(s) => s.id}
          empty="目前尚無來信。"
          columns={[
            {
              header: "收件時間",
              cell: (s) => (
                <span className="font-mono text-[13px] whitespace-nowrap">
                  {formatDate(s.created_at)}
                </span>
              ),
            },
            {
              header: "姓名",
              cell: (s) => <span className="font-medium">{s.name || "—"}</span>,
            },
            { header: "公司", cell: (s) => s.company || "—" },
            {
              header: "聯絡方式",
              cell: (s) => (
                <div className="flex flex-col gap-0.5">
                  {s.phone ? (
                    <a
                      href={`tel:${s.phone}`}
                      className="text-primary-deep hover:underline"
                    >
                      {s.phone}
                    </a>
                  ) : null}
                  {s.email ? (
                    <a
                      href={`mailto:${s.email}`}
                      className="text-primary-deep hover:underline"
                    >
                      {s.email}
                    </a>
                  ) : null}
                  {!s.phone && !s.email ? "—" : null}
                </div>
              ),
            },
            {
              header: "需求留言",
              className: "max-w-[320px]",
              cell: (s) => (
                <span className="block whitespace-pre-wrap">
                  {s.message || "—"}
                </span>
              ),
            },
            {
              header: "來源頁",
              cell: (s) => (
                <span className="text-text-muted font-mono text-[12px]">
                  {s.source_page || "—"}
                </span>
              ),
            },
          ]}
        />
      </div>

      {/* 聯絡資訊編輯 */}
      <div className="mt-10">
        <h2 className="text-ink text-[20px] font-bold">聯絡資訊設定</h2>
        <p className="text-text-muted mt-1 text-[15px]">
          編輯公開聯絡頁右側的服務中心資訊（地址 / 電話 / Email）。
        </p>
        <div className="mt-4">
          <ContactInfoForm initialJson={JSON.stringify(infoValue, null, 2)} />
        </div>
      </div>
    </div>
  );
}
