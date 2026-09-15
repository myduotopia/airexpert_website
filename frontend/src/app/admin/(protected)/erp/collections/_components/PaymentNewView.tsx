import Link from "next/link";
import {
  listCustomerOptions,
  listVendorOptions,
} from "@/lib/erp/queries/pickers";
import { taipeiToday } from "@/lib/erp/statement";
import type { PaymentDirection } from "@/lib/erp/types";
import { DIRECTION_META } from "./allocation";
import { PaymentForm } from "./PaymentForm";
import { PaymentTabs } from "./PaymentTabs";

// 新增收款 / 付款頁（server component）：讀出對象選項後交給 PaymentForm。
export async function PaymentNewView({
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
      <h1 className="text-ink mt-1 mb-4 text-[24px] font-bold">
        新增{meta.label}
      </h1>
      <PaymentForm
        direction={direction}
        customers={customers}
        vendors={vendors}
        today={taipeiToday()}
      />
    </div>
  );
}
