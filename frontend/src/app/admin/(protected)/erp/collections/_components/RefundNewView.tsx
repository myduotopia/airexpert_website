import Link from "next/link";
import {
  listCustomerOptions,
  listVendorOptions,
} from "@/lib/erp/queries/pickers";
import { taipeiToday } from "@/lib/erp/statement";
import type { PaymentDirection } from "@/lib/erp/types";
import { DIRECTION_META } from "./allocation";
import { PaymentTabs } from "./PaymentTabs";
import { RefundForm } from "./RefundForm";

// 退款給客戶／廠商退款頁（server component，#249）：讀出對象選項後交給 RefundForm。
export async function RefundNewView({
  direction,
}: {
  direction: PaymentDirection;
}) {
  const meta = DIRECTION_META[direction];
  const [customers, vendors] = await Promise.all([
    direction === "in" ? listCustomerOptions() : Promise.resolve([]),
    direction === "out" ? listVendorOptions() : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto max-w-[1040px]">
      <PaymentTabs active={direction} />
      <Link
        href={meta.basePath}
        className="text-text-muted hover:text-ink text-[13px]"
      >
        ← {meta.label}列表
      </Link>
      <h1 className="text-ink mt-1 mb-1 text-[24px] font-bold">
        {meta.refundAction}
      </h1>
      <p className="text-text-muted mb-4 text-[14px]">
        {direction === "in"
          ? "把客戶多付的預收退還給客戶（匯款、現金或支票），過帳後扣減預收。最多可退「預收 − 未結應收」。"
          : "廠商退還我方預付款（匯款、現金或支票），過帳後扣減預付。最多可退「預付 − 未結應付」。"}
      </p>
      <RefundForm
        direction={direction}
        customers={customers}
        vendors={vendors}
        today={taipeiToday()}
      />
    </div>
  );
}
