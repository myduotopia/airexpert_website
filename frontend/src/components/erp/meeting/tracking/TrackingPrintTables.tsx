// 週報追蹤清單（#272）列印用表格：搭配 #271 的 MeetingPrintStyles／MeetingPrintSheet（table.mtg-table）。
// 無 hooks，server component 使用。欄位與畫面清單一致；待確認、訂金未收、待討論以紅字（mtg-alert），
// 重點追蹤列以醒目底色（tr.mtg-key，列印保留底色）。
import { deliveryDeposit } from "@/lib/erp/tracking/csv";
import { depositBasisLabel } from "@/lib/erp/tracking/deposit";
import {
  formatDeliveryWindow,
  formatTrackingDate,
  latestProgressText,
} from "@/lib/erp/tracking/display";
import {
  DELIVERY_STATUS_LABELS,
  DEPOSIT_LABELS,
  MACHINE_ISSUE_STATUS_LABELS,
  REPAIR_STATUS_LABELS,
  type DeliveryJobRow,
  type MachineIssueRow,
  type RepairJobRow,
} from "@/lib/erp/tracking/types";

function Empty({ children }: { children: string }) {
  return <p className="mtg-empty">{children}</p>;
}

export function DeliveryPrintTable({
  rows,
  refYear,
}: {
  rows: DeliveryJobRow[];
  refYear: number;
}) {
  if (rows.length === 0) return <Empty>沒有符合條件的交機進度。</Empty>;
  return (
    <table className="mtg-table">
      <thead>
        <tr>
          <th>客戶</th>
          <th>訂金</th>
          <th>負責業務</th>
          <th>交機負責人</th>
          <th>材料確認</th>
          <th>機器設備</th>
          <th>交機時間</th>
          <th>注意事項</th>
          <th>狀態</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const deposit = deliveryDeposit(r);
          const basis = depositBasisLabel(deposit);
          const when = formatDeliveryWindow(
            r.delivery_start,
            r.delivery_end,
            refYear,
          );
          return (
            <tr key={r.id}>
              <td>
                {r.customer_name}
                {r.doc_no ? (
                  <span className="mtg-sub">
                    {r.doc_type === "S" ? "銷貨" : "報價"} {r.doc_no}
                  </span>
                ) : null}
              </td>
              <td className="mtg-nowrap">
                <span
                  className={
                    deposit.status === "received" ? undefined : "mtg-alert"
                  }
                >
                  {DEPOSIT_LABELS[deposit.status]}
                </span>
                {basis ? <span className="mtg-sub">{basis}</span> : null}
              </td>
              <td className="mtg-nowrap">{r.sales_rep_name ?? ""}</td>
              <td className="mtg-nowrap">
                {r.delivery_owner_name ?? (
                  <span className="mtg-alert">待確認</span>
                )}
              </td>
              <td className="mtg-nowrap">
                {r.materials_confirmed ? "已確認" : "未確認"}
              </td>
              <td className="mtg-wrap">{r.equipment ?? ""}</td>
              <td className="mtg-nowrap">
                {when.pending ? (
                  <span className="mtg-alert">{when.text}</span>
                ) : (
                  when.text
                )}
              </td>
              <td className="mtg-wrap">{r.note ?? ""}</td>
              <td className="mtg-nowrap">
                {DELIVERY_STATUS_LABELS[r.status] ?? r.status}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function RepairsPrintTable({
  rows,
  refYear,
}: {
  rows: RepairJobRow[];
  refYear: number;
}) {
  if (rows.length === 0) return <Empty>沒有符合條件的進廠維修。</Empty>;
  return (
    <table className="mtg-table">
      <thead>
        <tr>
          <th>客戶</th>
          <th>進廠日期</th>
          <th>機型</th>
          <th>問題</th>
          <th>處理進度</th>
          <th>負責人</th>
          <th>狀態</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td>{r.customer_name}</td>
            <td className="mtg-nowrap">
              {formatTrackingDate(r.received_on, refYear)}
            </td>
            <td>{r.model ?? ""}</td>
            <td className="mtg-wrap">{r.description}</td>
            <td className="mtg-wrap">
              {latestProgressText(
                r.latest_progress_date,
                r.latest_progress,
                refYear,
              )}
            </td>
            <td className="mtg-nowrap">{r.owner_name ?? ""}</td>
            <td className="mtg-nowrap">
              {REPAIR_STATUS_LABELS[r.status] ?? r.status}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function MachineIssuesPrintTable({
  rows,
  refYear,
}: {
  rows: MachineIssueRow[];
  refYear: number;
}) {
  if (rows.length === 0) return <Empty>沒有符合條件的新機問題。</Empty>;
  return (
    <table className="mtg-table">
      <thead>
        <tr>
          <th>客戶</th>
          <th>交機日期</th>
          <th>機型</th>
          <th>問題</th>
          <th>發生日期</th>
          <th>處理進度</th>
          <th>負責人</th>
          <th>狀態</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className={r.is_key ? "mtg-key" : undefined}>
            <td>
              {r.is_key ? "★ " : ""}
              {r.customer_name}
            </td>
            <td className="mtg-nowrap">
              {formatTrackingDate(r.delivered_on, refYear)}
            </td>
            <td>
              {r.model ?? ""}
              {r.machine_serial_no ? (
                <span className="mtg-sub">{r.machine_serial_no}</span>
              ) : null}
            </td>
            <td className="mtg-wrap">{r.description}</td>
            <td className="mtg-nowrap">
              {formatTrackingDate(r.occurred_on, refYear)}
            </td>
            <td className="mtg-wrap">
              {latestProgressText(
                r.latest_progress_date,
                r.latest_progress,
                refYear,
              )}
            </td>
            <td className="mtg-nowrap">{r.owner_name ?? ""}</td>
            <td className="mtg-nowrap">
              {r.status === "discussing" ? (
                <span className="mtg-alert">
                  {MACHINE_ISSUE_STATUS_LABELS[r.status]}
                </span>
              ) : (
                (MACHINE_ISSUE_STATUS_LABELS[r.status] ?? r.status)
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
