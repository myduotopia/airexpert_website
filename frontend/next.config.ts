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
};

export default nextConfig;
