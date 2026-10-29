// 廠商詳情頁的「提醒規則」區塊（#274）：列出該廠商的規則（備註自動產生＋手動），可新增手動規則、編輯、停用。
import Link from "next/link";
import { listVendorReminderRules } from "@/lib/erp/queries/reminders";
import { taipeiToday } from "@/lib/erp/statement";
import { RulesTable } from "./RulesTable";
import { REMINDERS_PATH } from "./ui";

export async function VendorReminderSection({
  vendorId,
  vendorName,
}: {
  vendorId: string;
  vendorName: string;
}) {
  const res = await listVendorReminderRules(vendorId);
  return (
    <section className="mt-8">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-ink text-[18px] font-bold">提醒規則</h2>
        <Link
          href={REMINDERS_PATH}
          className="text-ink hover:text-primary-deep text-[14px] font-medium"
        >
          前往提醒事項
        </Link>
      </div>
      <p className="text-text-muted mb-3 text-[14px]">
        備註或付款條件寫有「每月10號匯款」「月底對帳」「每週三送貨」等固定日期時，存檔後自動產生規則；
        也可在此新增手動規則。
      </p>
      {!res.ok ? (
        <p role="alert" className="text-[14px] text-red-600">
          {res.error}
        </p>
      ) : (
        <RulesTable
          rules={res.data}
          today={taipeiToday()}
          fixedVendor={{ id: vendorId, name: vendorName }}
          showVendor={false}
        />
      )}
    </section>
  );
}
