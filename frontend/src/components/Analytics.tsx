// GA4（gtag.js）注入 —— 僅在後台設定了 ga4_id 時由 layout 渲染。
// 未設定時 layout 不會 render 本元件 → 完全無追蹤腳本載入。
import Script from "next/script";

/**
 * 載入 gtag.js 並初始化 GA4。使用 next/script `afterInteractive`：
 * 不阻塞首屏，於頁面可互動後載入分析腳本。
 */
export function GoogleAnalytics({ ga4Id }: { ga4Id: string }) {
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${ga4Id}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${ga4Id}');
        `}
      </Script>
    </>
  );
}
