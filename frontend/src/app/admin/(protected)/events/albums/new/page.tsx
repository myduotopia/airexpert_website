import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { AlbumForm } from "../../AlbumForm";

export const metadata = { title: "新增活動相簿" };

export default async function NewAlbumPage() {
  await requireAdmin();

  return (
    <div className="mx-auto max-w-[840px]">
      <Link
        href="/admin/events"
        className="text-text-muted hover:text-ink text-[13px]"
      >
        ← 返回公司活動
      </Link>
      <h1 className="text-ink mt-2 text-[24px] font-bold">新增活動相簿</h1>
      <p className="text-text-muted mt-1 text-[14px]">
        建立相簿後，即可在編輯頁上傳照片。
      </p>
      <div className="mt-6">
        <AlbumForm />
      </div>
    </div>
  );
}
