import { getGscDashboard } from "@/lib/analytics/gsc";
import { hasServiceAccount } from "@/lib/analytics/google-auth";
import { KpiCard } from "./KpiCard";
import { DataTable } from "./DataTable";
import { OpportunityList } from "./OpportunityList";
import { SetupNotice } from "./SetupNotice";

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const pos = (n: number) => n.toFixed(1);

export async function GscSection({
  siteUrl,
  days,
}: {
  siteUrl: string | null;
  days: number;
}) {
  if (!siteUrl) {
    return (
      <SetupNotice title="尚未設定 Search Console 資源">
        請至網站設定填入 GSC 資源網址。
      </SetupNotice>
    );
  }
  if (!hasServiceAccount()) {
    return (
      <SetupNotice title="尚未設定服務帳戶金鑰">
        請設定環境變數 GOOGLE_SERVICE_ACCOUNT_JSON。
      </SetupNotice>
    );
  }
  let d;
  try {
    d = await getGscDashboard(siteUrl, days);
  } catch (e) {
    return (
      <SetupNotice title="讀取 Search Console 失敗">
        {(e as Error).message}
        。請確認服務帳戶已被加入該資源，且資源網址格式正確。
      </SetupNotice>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <p className="text-text-muted text-[12px]">
        搜尋數據截至 {d.asOf}（Search Console 約有 2–3 天延遲）
      </p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="總點擊" metric={d.kpis.clicks} />
        <KpiCard label="總曝光" metric={d.kpis.impressions} />
        <KpiCard label="平均 CTR" metric={d.kpis.ctr} format={pct} />
        <KpiCard
          label="平均排名"
          metric={d.kpis.position}
          format={pos}
          lowerIsBetter
        />
      </div>
      <div className="border-border rounded-xl border bg-white p-4">
        <p className="text-ink mb-3 text-[14px] font-semibold">
          優化機會（曝光高、點擊率低）
        </p>
        <OpportunityList items={d.opportunities} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="border-border rounded-xl border bg-white p-4">
          <p className="text-ink mb-3 text-[14px] font-semibold">
            熱門關鍵字 Top 20
          </p>
          <DataTable
            rows={d.queries}
            getKey={(r) => r.query}
            columns={[
              { header: "關鍵字", cell: (r) => r.query },
              { header: "點擊", align: "right", cell: (r) => r.clicks },
              { header: "曝光", align: "right", cell: (r) => r.impressions },
              { header: "CTR", align: "right", cell: (r) => pct(r.ctr) },
              { header: "排名", align: "right", cell: (r) => pos(r.position) },
            ]}
          />
        </div>
        <div className="border-border rounded-xl border bg-white p-4">
          <p className="text-ink mb-3 text-[14px] font-semibold">
            著陸頁 Top 20
          </p>
          <DataTable
            rows={d.pages}
            getKey={(r) => r.page}
            columns={[
              {
                header: "頁面",
                cell: (r) => <span title={r.page}>{r.page}</span>,
              },
              { header: "點擊", align: "right", cell: (r) => r.clicks },
              { header: "曝光", align: "right", cell: (r) => r.impressions },
              { header: "CTR", align: "right", cell: (r) => pct(r.ctr) },
              { header: "排名", align: "right", cell: (r) => pos(r.position) },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
