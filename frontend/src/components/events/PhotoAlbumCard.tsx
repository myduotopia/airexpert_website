import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ImageIcon } from "lucide-react";
import type { PhotoAlbum } from "@/lib/types";

// 活動花絮相簿卡片（沿用 Eco Green Light 卡片語彙：圓角 14、細綠灰邊、封面 + 標題 + 摘要）。
// 整張卡可點擊，導向 /events/albums/[slug]。
export function PhotoAlbumCard({ album }: { album: PhotoAlbum }) {
  const href = `/events/albums/${album.slug}`;
  return (
    <li className="border-border bg-surface flex flex-col overflow-hidden rounded-[14px] border">
      <Link href={href} className="group flex h-full flex-col">
        <div className="bg-surface-muted relative aspect-[380/240] w-full overflow-hidden">
          {album.cover_image ? (
            <Image
              src={album.cover_image}
              alt={album.title}
              fill
              sizes="(max-width: 768px) 100vw, 380px"
              className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <span
              className="bg-surface-muted flex h-full w-full items-center justify-center"
              aria-hidden="true"
            >
              <ImageIcon className="text-primary/40 h-8 w-8" />
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-3 p-[22px]">
          <h3 className="text-ink group-hover:text-primary-deep text-[18px] leading-[1.4] font-semibold transition-colors">
            {album.title}
          </h3>

          {album.description ? (
            <p className="text-text-muted line-clamp-2 text-[14px] leading-[1.6]">
              {album.description}
            </p>
          ) : null}

          <span className="text-primary-deep mt-auto inline-flex items-center gap-1.5 text-[13px] font-semibold">
            查看相簿
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </Link>
    </li>
  );
}
