import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { FloatingSocial } from "@/components/FloatingSocial";
import { SiteChrome } from "@/components/SiteChrome";
import { GoogleAnalytics } from "@/components/Analytics";
import { getBranding, getAnalytics } from "@/lib/data/site";
import { DEFAULT_OG_IMAGE } from "@/lib/seo";

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
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.airexpert.com.tw";

const SITE_NAME = "超勁賀空壓科技 AirExpert";
// 首頁 <title>：品牌 + 主關鍵字（空壓機廠商／漢鐘經銷／產品線），兼顧品牌與 SEO。
// 子頁沿用各自 title + template；此值只作用於無自訂 title 的首頁與 OG/Twitter 標題。
const HOME_TITLE =
  "空壓機廠商・漢鐘空壓機經銷｜變頻/無油空壓機與空壓系統規劃 - 超勁賀空壓科技";
const SITE_DESCRIPTION =
  "超勁賀空壓科技是專業空壓機廠商，漢鐘（HANBELL）空壓機經銷與服務，提供變頻空壓機、永磁變頻與無油空壓機、冷凍式乾燥機，專精工業空壓系統規劃、節能改善與空壓機節能補助評估，打造節能潔淨的壓縮空氣解決方案。";

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
      default: HOME_TITLE,
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
      title: HOME_TITLE,
      description: SITE_DESCRIPTION,
      images: [
        {
          url: DEFAULT_OG_IMAGE,
          width: 1200,
          height: 630,
          alt: SITE_NAME,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: HOME_TITLE,
      description: SITE_DESCRIPTION,
      images: [DEFAULT_OG_IMAGE],
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
