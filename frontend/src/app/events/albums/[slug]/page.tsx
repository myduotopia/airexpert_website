import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getPhotoAlbumBySlug } from "@/lib/data";
import { buildSeoMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";
import { PhotoGrid } from "@/components/events/PhotoGrid";

type PageProps = {
  // Next 16：dynamic params 為 Promise，須 await。
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const album = await getPhotoAlbumBySlug(slug);
  if (!album) return { title: "相簿不存在" };
  return buildSeoMetadata(album, {
    title: `${album.title} | 公司活動`,
    description: album.description,
    image: album.cover_image,
    canonicalPath: `/events/albums/${slug}`,
  });
}

export default async function AlbumDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const album = await getPhotoAlbumBySlug(slug);

  if (!album) {
    notFound();
  }

  return (
    <>
      <JsonLd data={album.schema_jsonld} />
      {/* Header band */}
      <section className="bg-surface-muted border-border border-b">
        <div className="mx-auto max-w-[1440px] px-6 pt-12 pb-10 md:px-20">
          <Link
            href="/events"
            className="text-text-muted hover:text-primary-deep inline-flex items-center gap-1.5 text-[14px] font-medium transition-colors"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            返回公司活動
          </Link>
          <p className="text-primary-deep mt-6 font-mono text-[12px] tracking-[1px] uppercase">
            PHOTO ALBUM
          </p>
          <h1 className="text-ink mt-2 text-[32px] leading-[1.15] font-bold sm:text-[40px]">
            {album.title}
          </h1>
          {album.description ? (
            <p className="text-text-muted mt-4 max-w-[640px] text-[16px] leading-[1.65]">
              {album.description}
            </p>
          ) : null}
        </div>
      </section>

      {/* Photo grid */}
      <section className="bg-surface">
        <div className="mx-auto max-w-[1440px] px-6 py-14 md:px-20 md:py-16">
          <PhotoGrid photos={album.photos} />
        </div>
      </section>
    </>
  );
}
