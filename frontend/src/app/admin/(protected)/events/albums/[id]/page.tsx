import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminSupabase } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/admin/auth";
import type { PhotoAlbum, Photo } from "@/lib/types";
import { AlbumForm } from "../../AlbumForm";
import { AlbumPhotos } from "../../AlbumPhotos";

export const metadata = { title: "編輯活動相簿" };

type EditPageProps = {
  // Next 16：dynamic params 為 Promise，須 await。
  params: Promise<{ id: string }>;
};

async function getAlbumWithPhotos(
  id: string,
): Promise<{ album: PhotoAlbum; photos: Photo[] } | null> {
  const supabase = getAdminSupabase();
  const { data: album, error } = await supabase
    .from("photo_albums")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!album) return null;

  const { data: photos, error: pErr } = await supabase
    .from("photos")
    .select("*")
    .eq("album_id", id)
    .order("sort_order", { ascending: true });
  if (pErr) throw new Error(pErr.message);

  return { album: album as PhotoAlbum, photos: (photos ?? []) as Photo[] };
}

export default async function EditAlbumPage(props: EditPageProps) {
  await requireAdmin();
  const { id } = await props.params;
  const result = await getAlbumWithPhotos(id);

  if (!result) {
    notFound();
  }

  const { album, photos } = result;

  return (
    <div className="mx-auto max-w-[840px]">
      <Link
        href="/admin/events"
        className="text-text-muted hover:text-ink text-[13px]"
      >
        ← 返回公司活動
      </Link>
      <h1 className="text-ink mt-2 text-[24px] font-bold">
        編輯活動相簿：{album.title}
      </h1>

      <div className="mt-6">
        <AlbumForm album={album} />
      </div>

      <div className="mt-8">
        <h2 className="text-ink mb-3 text-[18px] font-semibold">照片管理</h2>
        <AlbumPhotos albumId={album.id} photos={photos} />
      </div>
    </div>
  );
}
