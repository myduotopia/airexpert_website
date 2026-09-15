import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/admin/auth";
import {
  getErpCustomer,
  getPartyBalance,
  listCustomerMachines,
  listRecentDocuments,
} from "@/lib/erp/queries/master-data";
import type { MxMachine } from "@/lib/admin/maintenance";
import { cardTypeLabel } from "@/lib/admin/maintenance-normalize";
import { machineTagLabel } from "@/lib/admin/machine-identity";
import { rocDateTime } from "@/lib/admin/minguo";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { MoneyText } from "@/components/erp/MoneyText";
import { RecentDocuments } from "../../items/_components/RecentDocuments";
import {
  ActiveBadge,
  Info,
  InfoGrid,
  LINK_PRIMARY,
  LINK_SECONDARY,
  MasterHeader,
  MasterTabs,
  StatCard,
} from "../../items/_components/master-ui";

export const metadata = { title: "客戶 · ERP 基本資料" };

const MACHINE_COLUMNS: Column<MxMachine>[] = [
  {
    header: "卡別",
    cell: (m) => (
      <span className="border-border text-text-muted inline-flex items-center rounded-full border px-2 py-0.5 text-[12px]">
        {cardTypeLabel(m.card_type)}
      </span>
    ),
  },
  {
    header: "機台",
    cell: (m) => (
      <Link
        href={`/admin/maintenance/${m.id}`}
        className="text-ink hover:text-primary-deep font-medium"
      >
        {machineTagLabel(m)}
      </Link>
    ),
  },
  { header: "機型", cell: (m) => m.model ?? "—" },
  { header: "使用地點", cell: (m) => m.location ?? "—" },
  {
    header: "狀態",
    cell: (m) =>
      m.archived_at ? (
        <span className="text-text-muted text-[13px]">
          已封存 {rocDateTime(m.archived_at)}
        </span>
      ) : (
        "使用中"
      ),
  },
  {
    header: "",
    className: "text-right whitespace-nowrap",
    cell: (m) => (
      <Link
        href={`/admin/maintenance/${m.id}`}
        className="text-primary-deep hover:bg-surface-muted inline-flex h-9 items-center rounded-md px-3 text-[13px] font-medium"
      >
        進入保養卡
      </Link>
    ),
  },
];

export default async function ErpCustomerDetailPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  await requireModule("erp");
  const { customerId } = await params;
  const customer = await getErpCustomer(customerId);
  if (!customer) notFound();
  const [balance, docs, machines] = await Promise.all([
    getPartyBalance("customer", customerId),
    listRecentDocuments({ customerId }),
    listCustomerMachines(customerId),
  ]);

  return (
    <div className="mx-auto max-w-[1100px]">
      <MasterTabs active="customers" />
      <MasterHeader
        title={
          <>
            {customer.name}
            {customer.code && (
              <span className="text-text-muted ml-2 font-mono text-[16px] font-normal">
                {customer.code}
              </span>
            )}
          </>
        }
        description={<ActiveBadge active={customer.erp_active} />}
        actions={
          <>
            <Link href="/admin/erp/customers" className={LINK_SECONDARY}>
              返回客戶列表
            </Link>
            <Link
              href={`/admin/erp/customers/${customer.id}/edit`}
              className={LINK_PRIMARY}
            >
              編輯
            </Link>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="應收餘額（TWD）" hint="已過帳銷貨／銷退單未沖銷金額">
          <MoneyText value={balance.balance} negativeRed />
        </StatCard>
        <StatCard label="預收（TWD）" hint="已收款但尚未沖到單據">
          <MoneyText value={balance.unallocated} negativeRed />
        </StatCard>
      </div>

      <InfoGrid>
        <Info label="統一編號">{customer.tax_id ?? "—"}</Info>
        <Info label="發票抬頭">{customer.invoice_title ?? "—"}</Info>
        <Info label="聯絡人">{customer.contact_person ?? "—"}</Info>
        <Info label="電話">{customer.phone ?? "—"}</Info>
        <Info label="業務">{customer.sales_rep ?? "—"}</Info>
        <Info label="付款條件">{customer.payment_terms ?? "—"}</Info>
        <Info label="聯絡地址" wide>
          {customer.address ?? "—"}
        </Info>
        <Info label="送貨地址" wide>
          {customer.delivery_address ?? "—"}
        </Info>
        <Info label="備註" wide>
          {customer.note ?? "—"}
        </Info>
      </InfoGrid>

      <h2 className="text-ink mt-8 mb-4 text-[18px] font-bold">近期單據</h2>
      <RecentDocuments rows={docs} />

      <h2 className="text-ink mt-8 mb-4 text-[18px] font-bold">
        名下保養卡機台（{machines.length}）
      </h2>
      <DataTable
        rows={machines}
        columns={MACHINE_COLUMNS}
        getKey={(m) => m.id}
        empty="此客戶尚無保養卡機台。"
      />
    </div>
  );
}
