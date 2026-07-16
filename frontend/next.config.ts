import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Vercel Hobby 方案的 Image Optimization 有用量上限；超過後 /_next/image
    // 會回 402（OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED），導致全站 next/image
    // 圖片壞掉。改以原檔直接提供（不經最佳化服務）以恢復顯示；日後升級方案或
    // 改用外部 loader 時可移除此行重新開啟最佳化。
    unoptimized: true,
    // Product images are served from Supabase Storage public buckets. Real
    // assets are imported in issue #8; allowing the project's storage host lets
    // next/image optimise them once present. Adjust the hostname pattern if the
    // Supabase project domain differs.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "img.youtube.com",
        pathname: "/vi/**",
      },
    ],
  },
  // Interim launch: sections whose content is still being finalised redirect
  // to /maintenance (temporary 307). Remove this block to restore the real
  // pages once their content is ready.
  async redirects() {
    const sections = ["tech", "about"];
    return sections.flatMap((s) => [
      { source: `/${s}`, destination: "/maintenance", permanent: false },
      { source: `/${s}/:path*`, destination: "/maintenance", permanent: false },
    ]);
  },
};

export default nextConfig;
