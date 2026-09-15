import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/admin/auth";
import {
  getPartyBalance,
  getVendor,
  listRecentDocuments,
} from "@/lib/erp/queries/master-data";
import { rocDateTime } from "@/lib/admin/minguo";
import { MoneyText } from "@/components/erp/MoneyText";
import { ConfirmDeleteButton } from "../../items/_components/ConfirmDeleteButton";
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
import { deleteVendorAction } from "../actions";

export const metadata = { title: "廠商 · ERP 基本資料" };

export default async function VendorDetailPage({
  params,
}: {
  params: Promise<{ vendorId: string }>;
}) {
  await requireModule("erp");
  const { vendorId } = await params;
  const vendor = await getVendor(vendorId);
  if (!vendor) notFound();
  const [balance, docs] = await Promise.all([
    getPartyBalance("vendor", vendorId),
    listRecentDocuments({ vendorId }),
  ]);

  return (
    <div className="mx-auto max-w-[1100px]">
      <MasterTabs active="vendors" />
      <MasterHeader
        title={
          <>
            {vendor.name}
            <span className="text-text-muted ml-2 font-mono text-[16px] font-normal">
              {vendor.code}
            </span>
          </>
        }
        description={<ActiveBadge active={vendor.active} />}
        actions={
          <>
            <Link href="/admin/erp/vendors" className={LINK_SECONDARY}>
              返回廠商列表
            </Link>
            <Link
              href={`/admin/erp/vendors/${vendor.id}/edit`}
              className={LINK_PRIMARY}
            >
              編輯
            </Link>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="應付餘額（TWD）" hint="已過帳進貨／進退單未沖銷金額">
          <MoneyText value={balance.balance} negativeRed />
        </StatCard>
        <StatCard label="未沖銷預付（TWD）" hint="已付款但尚未沖到單據">
          <MoneyText value={balance.unallocated} negativeRed />
        </StatCard>
      </div>

      <InfoGrid>
        <Info label="統一編號">{vendor.tax_id ?? "—"}</Info>
        <Info label="聯絡人">{vendor.contact_person ?? "—"}</Info>
        <Info label="電話">{vendor.phone ?? "—"}</Info>
        <Info label="傳真">{vendor.fax ?? "—"}</Info>
        <Info label="Email">{vendor.email ?? "—"}</Info>
        <Info label="幣別">{vendor.currency}</Info>
        <Info label="付款條件">{vendor.payment_terms ?? "—"}</Info>
        <Info label="最後更新">{rocDateTime(vendor.updated_at)}</Info>
        <Info label="地址" wide>
          {vendor.address ?? "—"}
        </Info>
        <Info label="備註" wide>
          {vendor.note ?? "—"}
        </Info>
      </InfoGrid>

      <h2 className="text-ink mt-8 mb-4 text-[18px] font-bold">近期單據</h2>
      <RecentDocuments rows={docs} />

      <section className="border-border mt-10 rounded-xl border bg-white p-5">
        <h2 className="text-ink text-[16px] font-bold">刪除廠商</h2>
        <p className="text-text-muted mt-1 mb-3 text-[14px]">
          已有單據或被品項設為預設廠商時無法刪除，請改為停用。
        </p>
        <ConfirmDeleteButton
          id={vendor.id}
          action={deleteVendorAction}
          confirmText={`確定刪除廠商「${vendor.code} ${vendor.name}」？`}
          redirectTo="/admin/erp/vendors"
        />
      </section>
    </div>
  );
}
