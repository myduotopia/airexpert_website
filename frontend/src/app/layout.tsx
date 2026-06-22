import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { FloatingSocial } from "@/components/FloatingSocial";
import { SiteChrome } from "@/components/SiteChrome";
import { GoogleAnalytics } from "@/components/Analytics";
import { getBranding, getAnalytics } from "@/lib/data/site";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

// Overridable at deploy; same fallback as sitemap.ts / robots.ts.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://airexpert.com.tw";

const SITE_NAME = "超勁賀空壓科技 AirExpert";
const SITE_DESCRIPTION =
  "超勁賀空壓科技以節能氣源系統推動永續製造，提供空氣壓縮機、真空泵浦、鼓風機與乾燥機，導入 ISO 50001 能源管理，協助產業邁向淨零目標。";

// generateMetadata（非靜態 export）：favicon 由後台品牌資產動態決定，
// 未設定時退回內建 /favicon.ico（getBranding 已含 fallback）。
export async function generateMetadata(): Promise<Metadata> {
  const { favicon_url } = await getBranding();
  const { gscVerification } = await getAnalytics();
  return {
    // metadataBase resolves relative OG/Twitter image + canonical URLs to absolute.
    metadataBase: new URL(SITE_URL),
    // Browser tab / bookmark icon — admin-configurable via site_settings.branding.
    icons: { icon: favicon_url },
    // Google Search Console 網站驗證（後台 analytics.gsc_verification）。
    // 未設定時不輸出（undefined）→ 不渲染 verification meta。
    verification: gscVerification ? { google: gscVerification } : undefined,
    // Child pages set only their own title; `template` appends the brand suffix.
    // `default` is used by pages without a title (and as the OpenGraph title).
    title: {
      default: SITE_NAME,
      template: "%s ｜ 超勁賀空壓科技",
    },
    description: SITE_DESCRIPTION,
    // No root-level canonical: without one each route self-canonicalizes to its
    // own URL. A blanket "/" here would wrongly mark every page a duplicate of home.
    openGraph: {
      type: "website",
      locale: "zh_TW",
      url: "/",
      siteName: SITE_NAME,
      title: SITE_NAME,
      description: SITE_DESCRIPTION,
      // TODO(seo): replace with final brand artwork; /og-default.png is a
      // simple brand-colour 1200×630 placeholder.
      images: [
        {
          url: "/og-default.png",
          width: 1200,
          height: 630,
          alt: SITE_NAME,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: SITE_NAME,
      description: SITE_DESCRIPTION,
      images: ["/og-default.png"],
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { logo_url } = await getBranding();
  const { ga4Id } = await getAnalytics();

  return (
    <html
      lang="zh-Hant-TW"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <SiteChrome
          header={<Header logoUrl={logo_url} />}
          footer={<Footer />}
          social={<FloatingSocial />}
        >
          {children}
        </SiteChrome>
        {/* GA4：僅在後台設定 ga4_id 時注入；未設定時零追蹤腳本。 */}
        {ga4Id ? <GoogleAnalytics ga4Id={ga4Id} /> : null}
      </body>
    </html>
  );
}
