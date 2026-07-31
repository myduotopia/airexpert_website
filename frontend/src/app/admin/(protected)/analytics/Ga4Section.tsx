import { getGa4Dashboard } from "@/lib/analytics/ga4";
import { hasServiceAccount } from "@/lib/analytics/google-auth";
import { prettyPagePath } from "@/lib/analytics/format";
import { KpiCard } from "./KpiCard";
import { LineChart } from "./LineChart";
import { BarList } from "./BarList";
import { DataTable } from "./DataTable";
import { SetupNotice } from "./SetupNotice";

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}分${s}秒` : `${s}秒`;
}

export async function Ga4Section({
  propertyId,
  days,
}: {
  propertyId: string | null;
  days: number;
}) {
  if (!propertyId) {
    return (
      <SetupNotice title="尚未設定 GA4 資源 ID">
        請至網站設定填入 GA4 資源 ID（純數字）。
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
    d = await getGa4Dashboard(propertyId, days);
  } catch (e) {
    return (
      <SetupNotice title="讀取 GA4 失敗">
        {(e as Error).message}。請確認服務帳戶已被加入該 GA4 資源。
      </SetupNotice>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <p className="text-text-muted text-[12px]">
        數據截至 {d.asOf}（不含當日）
      </p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="使用者" metric={d.users} />
        <KpiCard label="工作階段" metric={d.sessions} />
        <KpiCard label="頁面瀏覽" metric={d.pageViews} />
        <KpiCard
          label="平均參與時間"
          metric={d.avgEngagementSec}
          format={fmtDuration}
        />
      </div>
      <div className="border-border rounded-xl border bg-white p-4">
        <p className="text-ink mb-2 text-[14px] font-semibold">
          每日使用者（本期 vs 上期）
        </p>
        <LineChart points={d.daily} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="border-border rounded-xl border bg-white p-4">
          <p className="text-ink mb-3 text-[14px] font-semibold">
            熱門頁面 Top 10
          </p>
          <DataTable
            rows={d.topPages}
            getKey={(r) => r.path}
            columns={[
              {
                header: "頁面",
                cell: (r) => (
                  <span title={r.path}>
                    {prettyPagePath(r.title || r.path)}
                  </span>
                ),
              },
              {
                header: "瀏覽",
                align: "right",
                cell: (r) => r.views.toLocaleString("zh-TW"),
              },
              {
                header: "平均停留",
                align: "right",
                cell: (r) => fmtDuration(r.avgTimeSec),
              },
            ]}
          />
        </div>
        <div className="border-border rounded-xl border bg-white p-4">
          <p className="text-ink mb-3 text-[14px] font-semibold">
            流量來源 Top 8
          </p>
          <BarList rows={d.sources} />
          <p className="text-ink mt-4 mb-3 text-[14px] font-semibold">
            裝置分布
          </p>
          <BarList rows={d.devices} />
        </div>
      </div>
    </div>
  );
}
