import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
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
    ],
  },
  // Interim launch: sections whose content is still being finalised redirect
  // to /maintenance (temporary 307). Remove this block to restore the real
  // pages once their content is ready.
  async redirects() {
    const sections = ["products", "services", "tech", "news", "about"];
    return sections.flatMap((s) => [
      { source: `/${s}`, destination: "/maintenance", permanent: false },
      { source: `/${s}/:path*`, destination: "/maintenance", permanent: false },
    ]);
  },
};

export default nextConfig;
