import type { Metadata } from "next";
import { getPublishedEvents, getPublishedPhotoAlbums } from "@/lib/data";
import { EventVideoGrid } from "@/components/events/EventVideoGrid";
import { PhotoAlbumCard } from "@/components/events/PhotoAlbumCard";

export const metadata: Metadata = {
  title: "公司活動",
  description:
    "交機實錄影片與活動花絮相簿，記錄超勁賀與客戶一起完成的每一個節能現場。",
};

export default async function EventsPage() {
  const [events, albums] = await Promise.all([
    getPublishedEvents(),
    getPublishedPhotoAlbums(),
  ]);

  return (
    <>
      {/* Hero band（對應設計稿 D6tjZZ / Hero） */}
      <section className="bg-surface-muted border-border border-b">
        <div className="mx-auto flex max-w-[1440px] flex-col items-center gap-5 px-6 pt-16 pb-10 text-center md:px-20 md:pt-[72px]">
          <p className="text-primary-deep font-mono text-[12px] tracking-[1px] uppercase">
            COMPANY ACTIVITIES
          </p>
          <h1 className="text-ink text-[40px] leading-[1.1] font-bold sm:text-[52px]">
            公司活動
          </h1>
          <p className="text-text-muted max-w-[620px] text-[16px] leading-[1.6]">
            交機實錄影片與活動花絮相簿，記錄超勁賀與客戶一起完成的每一個節能現場。
          </p>
        </div>
      </section>

      {/* 交機影片 */}
      <section className="bg-surface">
        <div className="mx-auto max-w-[1440px] px-6 py-14 md:px-20 md:py-16">
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <p className="text-primary-deep font-mono text-[12px] tracking-[1px] uppercase">
                DELIVERY VIDEOS
              </p>
              <h2 className="text-ink mt-2 text-[26px] font-bold sm:text-[30px]">
                交機影片
              </h2>
            </div>
          </div>
          <EventVideoGrid events={events} />
        </div>
      </section>

      {/* 活動花絮相簿 */}
      <section className="bg-surface-muted border-border border-t">
        <div className="mx-auto max-w-[1440px] px-6 py-14 md:px-20 md:py-16">
          <div className="mb-8">
            <p className="text-primary-deep font-mono text-[12px] tracking-[1px] uppercase">
              PHOTO ALBUMS
            </p>
            <h2 className="text-ink mt-2 text-[26px] font-bold sm:text-[30px]">
              活動花絮
            </h2>
          </div>
          {albums.length === 0 ? (
            <p className="text-text-muted py-12 text-center text-[15px]">
              目前尚無活動相簿，敬請期待。
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {albums.map((album) => (
                <PhotoAlbumCard key={album.id} album={album} />
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
