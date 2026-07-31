import { Suspense } from "react";
import { requireRole } from "@/lib/admin/auth";
import { getAnalytics } from "@/lib/data/site";
import { RANGE_DAYS } from "@/lib/analytics/ranges";
import { RangeTabs } from "./RangeTabs";
import { RefreshButton } from "./RefreshButton";
import { Ga4Section } from "./Ga4Section";
import { GscSection } from "./GscSection";

export const metadata = { title: "流量分析" };

function SectionSkeleton() {
  return (
    <div className="border-border h-40 animate-pulse rounded-xl border bg-white" />
  );
}

/** 將 ?range= 收斂到允許值，預設 30。 */
function resolveRange(raw: string | undefined): number {
  const n = Number(raw);
  return (RANGE_DAYS as readonly number[]).includes(n) ? n : 30;
}

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  await requireRole(["admin", "seo_manager"]);
  const analytics = await getAnalytics();
  const { range } = await searchParams;
  const days = resolveRange(range);

  return (
    <div className="mx-auto max-w-[1200px]">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-ink text-[24px] font-bold">流量分析</h1>
          <p className="text-text-muted mt-1 text-[14px]">
            網站流量（GA4）與搜尋成效（Search Console）。數據每小時更新一次。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RangeTabs current={days} />
          <RefreshButton />
        </div>
      </div>

      <section className="mb-10">
        <h2 className="text-ink mb-4 text-[18px] font-semibold">網站流量</h2>
        <Suspense fallback={<SectionSkeleton />}>
          <Ga4Section propertyId={analytics.ga4PropertyId} days={days} />
        </Suspense>
      </section>

      <section>
        <h2 className="text-ink mb-4 text-[18px] font-semibold">搜尋成效</h2>
        <Suspense fallback={<SectionSkeleton />}>
          <GscSection siteUrl={analytics.gscSiteUrl} days={days} />
        </Suspense>
      </section>
    </div>
  );
}
