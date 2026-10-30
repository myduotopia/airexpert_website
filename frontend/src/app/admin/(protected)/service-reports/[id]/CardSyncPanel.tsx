// 詳情頁「保養卡同步」區塊（#280）：結案時由 DB 觸發器（0041）同步一列到該機台的保養卡。
// 這裡只顯示狀態：已同步的那一列（讀 mx_records），或結案時預計寫入的內容（lib/service-report/card-sync.ts 的 TS 版規則）。
import Link from "next/link";
import { hasMaintenanceAccess } from "@/lib/admin/auth";
import { rocDate } from "@/lib/admin/minguo";
import { SERVICE_TYPE_LABELS } from "@/lib/admin/maintenance-service-type";
import {
  COMPRESSOR_CARD_COLUMN_LABELS,
  mapReportToCardRecord,
  type CompressorCardColumn,
} from "@/lib/service-report/card-sync";
import { getCardSyncInfo } from "@/lib/service-report/card-sync-queries";
import type { ServiceReport } from "@/lib/service-report/types";

const COLUMNS = Object.keys(
  COMPRESSOR_CARD_COLUMN_LABELS,
) as CompressorCardColumn[];

function Row({ k, v }: { k: string; v: string | null | undefined }) {
  return (
    <div className="flex min-w-0 gap-2">
      <dt className="text-text-muted w-20 shrink-0">{k}</dt>
      <dd className="text-ink min-w-0 break-words whitespace-pre-wrap">
        {v || "—"}
      </dd>
    </div>
  );
}

export async function CardSyncPanel({ report }: { report: ServiceReport }) {
  const box = (children: React.ReactNode) => (
    <section className="border-border rounded-xl border bg-white p-4">
      <h2 className="text-ink mb-2 text-[15px] font-semibold">保養卡同步</h2>
      <div className="flex flex-col gap-2 text-[14px]">{children}</div>
    </section>
  );

  if (report.status === "voided") {
    return box(
      <p className="text-text-muted">
        作廢的報告單不會同步到保養卡（先前同步的紀錄已移除）。
      </p>,
    );
  }
  if (!report.machine_id) {
    return box(
      <p className="text-text-muted">
        未關聯保養卡機台：結案時不會同步到保養卡。
      </p>,
    );
  }

  const [info, canOpenCard] = await Promise.all([
    getCardSyncInfo(report.id, report.machine_id),
    hasMaintenanceAccess(),
  ]);
  if (!info.ok) {
    return box(
      <p role="alert" className="text-red-700">
        讀取保養卡同步狀態失敗：{info.error}
      </p>,
    );
  }
  const cardLink = canOpenCard ? (
    <Link
      href={`/admin/maintenance/${report.machine_id}`}
      className="text-primary-deep text-[13px] font-semibold"
    >
      開啟保養卡 →
    </Link>
  ) : null;

  const synced = info.data.synced;
  if (synced) {
    return box(
      <>
        <p className="text-ink">
          {report.status === "completed"
            ? "已同步到保養卡："
            : "曾於結案時同步到保養卡；再次結案會更新同一列："}
        </p>
        <dl className="flex flex-col gap-1.5">
          <Row k="日期" v={rocDate(synced.service_date)} />
          <Row k="時數" v={synced.hours} />
          <Row
            k="服務類型"
            v={
              synced.service_type
                ? SERVICE_TYPE_LABELS[synced.service_type]
                : null
            }
          />
          <Row k="維護員" v={synced.technician} />
        </dl>
        {cardLink}
      </>,
    );
  }

  if (info.data.card_type === null) {
    return box(
      <p className="text-text-muted">
        找不到報告單的保養卡機台，結案時不會同步。
      </p>,
    );
  }
  const preview = mapReportToCardRecord(report, {
    card_type: info.data.card_type,
  });
  if (!preview) return null;
  const isFilter = info.data.card_type === "filter";
  const parts = isFilter
    ? "依過濾卡耗材欄名比對（同名才寫入，其餘記入備註）"
    : COLUMNS.filter((c) => preview[c])
        .map((c) => `${COMPRESSOR_CARD_COLUMN_LABELS[c]} ${preview[c]}`)
        .join("、");

  return box(
    <>
      <p className="text-ink">
        {report.status === "completed"
          ? "尚未同步（此單在同步功能上線前結案）。"
          : "結案時會寫入一列到此機台的保養卡："}
      </p>
      <dl className="flex flex-col gap-1.5">
        <Row k="日期" v={rocDate(preview.service_date)} />
        <Row k="時數" v={preview.hours} />
        <Row
          k="服務類型"
          v={
            preview.service_type
              ? SERVICE_TYPE_LABELS[preview.service_type]
              : "待判定"
          }
        />
        <Row k="維護員" v={preview.technician} />
        <Row k="料件" v={parts} />
        <Row k="備註" v={preview.note} />
      </dl>
      {cardLink}
    </>,
  );
}
